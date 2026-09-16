// Manual smoke test with the official MCP SDK client (not part of `deno task test`).
// Run: deno task serve, then: deno run -A tests/oracle/sdk_smoke.ts
import { Client } from "npm:@modelcontextprotocol/sdk@1.30.0/client/index.js";
import { StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/sdk@1.30.0/client/streamableHttp.js";
const client = new Client({ name: "sdk-smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(Deno.env.get("HESBA_URL") ?? "http://localhost:8000/mcp/dev")));
console.log("server:", client.getServerVersion());
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
const r = await client.callTool({ name: "check_campaign", arguments: {
  productCost: 100, deliveryFee: 25, returnShippingFee: 15, packagingCost: 5, fulfillmentFee: 10,
  callCenterCostPerLead: 2, smsCostPerLead: 0.5, platformFeePct: 8, paymentGatewayPct: 2.5,
  paymentGatewayFixed: 3, vatPct: 14, marketerCommissionPct: 10, sellingPrice: 300, lang: "en",
  campaign: { adBudgetSpent: 1000, leads: 100, confirmed: 50, delivered: 40 } } });
console.log(r.content[0].text);
console.log("isError:", r.isError, "verdict:", (r.structuredContent as any).result.verdict);
await client.close();
