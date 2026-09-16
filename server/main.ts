/**
 * Entry point: `deno task serve`, or Deno Deploy.
 * HESBA_TOKENS: comma-separated secrets allowed in the /mcp/<token> path (default "dev").
 */
import { createHandler } from "./mcp.ts";

const tokens = (Deno.env.get("HESBA_TOKENS") ?? "dev").split(",").map((t) => t.trim());
const port = Number(Deno.env.get("PORT") ?? 8000);

const handler = createHandler({
  tokens,
  log: (event) => console.log(JSON.stringify(event)),
});

Deno.serve({ port }, handler);
