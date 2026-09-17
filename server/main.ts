/**
 * Entry point: `deno task serve`, or Deno Deploy.
 * HESBA_TOKENS: comma-separated secrets allowed in the /mcp/<token> path (default "dev").
 * HESBA_CHART_SECRET (optional): chart-link signing key. PUBLIC_BASE_URL: origin for chart links.
 */
import { createHandler } from "./mcp.ts";

const tokens = (Deno.env.get("HESBA_TOKENS") ?? "dev").split(",").map((t) => t.trim());
const port = Number(Deno.env.get("PORT") ?? 8000);

const handler = createHandler({
  tokens,
  chartSecret: Deno.env.get("HESBA_CHART_SECRET"),
  publicBaseUrl: Deno.env.get("PUBLIC_BASE_URL"),
  log: (event) => console.log(JSON.stringify(event)),
});

Deno.serve({ port }, handler);
