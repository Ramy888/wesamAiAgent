/**
 * Cloudflare Workers entry point (the Deno Deploy one is `server/main.ts`).
 *
 * Same handler, same tools: only how the request arrives and where the secrets come from
 * differ. Workers pass env per request instead of reading a process environment, so the
 * handler is built once per isolate and reused.
 */
import { type ConnInfo, createHandler } from "../server/mcp.ts";

interface Env {
  HESBA_TOKENS?: string;
  HESBA_CHART_SECRET?: string;
  PUBLIC_BASE_URL?: string;
}

type Handler = (req: Request, info?: ConnInfo) => Promise<Response>;

let handler: Handler | undefined;
let builtFor = "";

function handlerFor(env: Env): Handler {
  // Rebuild only when the secrets change, so the rate-limit window survives between requests.
  const key = `${env.HESBA_TOKENS}|${env.HESBA_CHART_SECRET}|${env.PUBLIC_BASE_URL}`;
  if (!handler || builtFor !== key) {
    handler = createHandler({
      tokens: (env.HESBA_TOKENS ?? "dev").split(",").map((t) => t.trim()),
      chartSecret: env.HESBA_CHART_SECRET,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      log: (event) => console.log(JSON.stringify(event)),
    });
    builtFor = key;
  }
  return handler;
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    // Cloudflare's client IP, for the per-client chart rate limit.
    const hostname = req.headers.get("cf-connecting-ip") ?? undefined;
    return handlerFor(env)(req, hostname ? { remoteAddr: { hostname } } : undefined);
  },
};
