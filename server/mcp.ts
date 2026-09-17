/**
 * Stateless MCP Streamable HTTP endpoint (JSON responses only), written by hand so it has no
 * dependencies (specs/spec.md §2.1, option b).
 *
 * Routes:  POST /mcp/<token>             JSON-RPC (single message or batch)
 *          GET  /chart/<kind>/<sig>.svg  signed chart images (public, rate-limited per IP)
 *          GET  /health                  liveness
 */
import { createHmac } from "node:crypto";
import { handleChartRequest } from "./charts.ts";
import { type ChartContext, ENGINE_VERSION, runTool, TOOL_BY_NAME, TOOLS } from "./tools.ts";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const MAX_BODY_BYTES = 32_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

const SERVER_INSTRUCTIONS =
  "Hesba calculator for cash-on-delivery e-commerce pricing. Every number you tell the seller " +
  "must come from these tools. Tools: price_product, cpa_table, price_bundles, check_campaign.";

export interface LogEvent {
  at: string;
  method: string;
  tool?: string;
  status: number | "error" | "ok";
  ms: number;
}

export interface HandlerOptions {
  tokens: string[];
  log?: (event: LogEvent) => void;
  now?: () => number;
  rateLimitPerMinute?: number;
  /** Chart signing key; defaults to a key derived from the first MCP token. */
  chartSecret?: string;
  /** Public origin for chart links (Wesam proxies MCP calls, so the request host is unreliable). */
  publicBaseUrl?: string;
}

type Json = Record<string, unknown>;
type RpcId = string | number | null;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

const rpcError = (id: RpcId, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });

/** Fixed one-minute windows per token; in-memory, so best-effort on multi-isolate hosts. */
function rateLimiter(now: () => number, limit: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string): boolean => {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start >= 60_000) {
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  };
}

export function createHandler(opts: HandlerOptions): (req: Request) => Promise<Response> {
  const tokens = new Set(opts.tokens.filter(Boolean));
  const log = opts.log ?? (() => {});
  const now = opts.now ?? Date.now;
  const allow = rateLimiter(now, opts.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE);
  const allowChart = rateLimiter(
    now,
    (opts.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE) * 2,
  );
  const chartSecret = opts.chartSecret ||
    createHmac("sha256", opts.tokens[0] ?? "dev").update("hesba-chart-key").digest("hex");
  let chartCtx: ChartContext | undefined;

  function dispatch(msg: Json): unknown {
    const id = (msg.id ?? null) as RpcId;
    const params = (msg.params ?? {}) as Json;
    const started = now();
    const done = (tool: string | undefined, status: LogEvent["status"]) =>
      log({
        at: new Date(started).toISOString(),
        method: String(msg.method),
        tool,
        status,
        ms: now() - started,
      });

    switch (msg.method) {
      case "initialize": {
        const asked = params.protocolVersion as string | undefined;
        done(undefined, "ok");
        return rpcResult(id, {
          protocolVersion: asked && SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
            ? asked
            : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "hesba-calculator",
            title: "Hesba Calculator",
            version: ENGINE_VERSION,
          },
          instructions: SERVER_INSTRUCTIONS,
        });
      }
      case "ping":
        done(undefined, "ok");
        return rpcResult(id, {});
      case "tools/list":
        done(undefined, "ok");
        return rpcResult(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
          })),
        });
      case "tools/call": {
        const name = String(params.name ?? "");
        const tool = TOOL_BY_NAME.get(name);
        if (!tool) {
          done(undefined, "error");
          return rpcError(id, -32602, `Unknown tool: ${name.slice(0, 64)}`);
        }
        try {
          const result = runTool(tool, params.arguments, chartCtx);
          done(name, result.isError ? "error" : "ok");
          return rpcResult(id, result);
        } catch {
          done(name, "error");
          return rpcResult(id, {
            content: [{ type: "text", text: "Internal calculator error. Please try again." }],
            isError: true,
          });
        }
      }
      default:
        done(undefined, "error");
        return rpcError(id, -32601, "Method not found");
    }
  }

  /** Returns a response object, or undefined for notifications. */
  function handleMessage(msg: unknown): unknown {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      return rpcError(null, -32600, "Invalid Request");
    }
    const m = msg as Json;
    if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      return rpcError((m.id ?? null) as RpcId, -32600, "Invalid Request");
    }
    const isNotification = !("id" in m);
    if (isNotification) return undefined;
    return dispatch(m);
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/chart/")) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anon";
      if (!allowChart(`chart:${ip}`)) return new Response("slow down", { status: 429 });
      const res = handleChartRequest(req, url, chartSecret)!;
      log({ at: new Date(now()).toISOString(), method: "chart", status: res.status, ms: 0 });
      return res;
    }

    if (url.pathname === "/health" && req.method === "GET") {
      return json({ ok: true, name: "hesba-calculator", version: ENGINE_VERSION });
    }

    const match = url.pathname.match(/^\/mcp\/([^/]+)\/?$/);
    if (!match || !tokens.has(decodeURIComponent(match[1]))) {
      return json({ error: "not found" }, 404);
    }
    const token = decodeURIComponent(match[1]);
    chartCtx = {
      baseUrl: (opts.publicBaseUrl || url.origin).replace(/\/$/, ""),
      secret: chartSecret,
    };

    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, 405, { allow: "POST" });
    }
    if (!allow(token)) {
      return json(rpcError(null, -32000, "Rate limit exceeded"), 429, { "retry-after": "60" });
    }

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      await req.body?.cancel();
      return json(rpcError(null, -32600, "Request too large"), 413);
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json(rpcError(null, -32600, "Request too large"), 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(rpcError(null, -32700, "Parse error"), 400);
    }

    if (Array.isArray(body)) {
      if (body.length === 0) return json(rpcError(null, -32600, "Invalid Request"), 400);
      const responses = body.map(handleMessage).filter((r) => r !== undefined);
      return responses.length ? json(responses) : new Response(null, { status: 202 });
    }
    const response = handleMessage(body);
    return response === undefined ? new Response(null, { status: 202 }) : json(response);
  };
}
