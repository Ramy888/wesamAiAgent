# Hesba — Bya3 pricing agent (Wesam.ai)

Bya3 is an AI pricing and ad-profit analyst for cash-on-delivery sellers in Egypt, the Gulf and
MENA. It runs on Wesam.ai. All of its math comes from the **Hesba calculator**, a small,
dependency-free MCP server in this repo.

## Run it in under 5 minutes (no Wesam account needed)

Requires [Deno](https://deno.com) 2.x.

```sh
deno task test      # test suite: Bine golden parity, the pricing model, validation, MCP protocol
deno task serve     # http://localhost:8000/mcp/dev  (token "dev" unless .env sets HESBA_TOKENS)
```

Call a tool:

```sh
curl -s -X POST http://localhost:8000/mcp/dev -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"price_product","arguments":{
  "productCost":100,"customsDutyPerUnit":10,"leadCpa":15,"confirmationRatePct":60,
  "deliveryRatePct":45,"deliveryFee":25,"returnShippingFee":15,"packagingCost":5,
  "fulfillmentFee":10,"callCenterCostPerLead":2,"smsCostPerLead":0.5,"platformFeePct":8,
  "paymentGatewayPct":2.5,"paymentGatewayFixed":3,"vatPct":15,"marketerCommissionPct":3,
  "targetMarginPct":10,"sellingPrice":300,"lang":"en"}}}'
```

Expected verdict: **BELOW TARGET**. Net profit is 2.19 EGP per order, and the tool suggests
raising the price to 345.23 EGP.

You can also connect MCP Inspector (`npx @modelcontextprotocol/inspector`) or Claude Code
(`claude mcp add --transport http hesba http://localhost:8000/mcp/dev`) to the local server,
or run `deno run -A tests/oracle/sdk_smoke.ts` while it is running.

## Tools

| Tool | What it answers |
|---|---|
| `price_product` | Safe and breakeven price, profit at your price, max CPA, breakeven ROAS, the CR needed, and a verdict |
| `cpa_table` | Max CPA per lead at margins from +20% to −20% |
| `price_bundles` | 2/3/4-piece bundle prices, and checks of offers such as "2 for 550" |
| `check_campaign` | Real campaign P&L and a PAUSE / FIX / SCALE verdict with the top lever |
| `compare_prices` | Your price against confirmed competitor offers: market band and profit if you matched each one |

## Layout

| Path | Contents |
|---|---|
| `engine/parity.ts` | Faithful port of Bine's Dart engine, checked against `reference/golden.json` |
| `engine/canonical.ts` | The single pricing model every tool uses (`specs/spec.md` §2.6) |
| `server/` | MCP Streamable HTTP handler, schemas and validation, text summaries |
| `wesam/` | Agent instructions, skills and workflow plan for Wesam |
| `landing/` | Landing page (https://hesba-ten.vercel.app) |
| `specs/` | Spec, test plan, MCP tools research |

## Production

- Server: https://hesba-calculator.hesba.deno.net (Deno Deploy, org `hesba`). `/health` is public.
- The MCP endpoint is `/mcp/<token>`. The token is the `HESBA_TOKENS` secret on Deno Deploy; it
  is never in this repo.
- Redeploy with `deno task deploy`, which runs the tests and uploads only `deno.json`,
  `deno.lock`, `engine/` and `server/`.

## Configuration

Put these in a local `.env` (copy `.env.example`). `.env` is git-ignored; never commit it.

| Variable | Default | Purpose |
|---|---|---|
| `HESBA_TOKENS` | `dev` | Comma-separated secrets accepted in the `/mcp/<token>` path |
| `PORT` | `8000` | Listen port |
| `DENO_DEPLOY_TOKEN`, `DENO_DEPLOY_ORG` | — | Used only by `deno task deploy` |
