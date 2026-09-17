# Tools / MCP servers for Bya3

Status: draft, 2026-09-16.

Wesam agents can only use **remote MCP servers**, added by URL (Streamable HTTP). Wesam
proxies the calls, each workspace signs in with OAuth, and Wesam always excludes tools that
publish, send or spend.

Research for this page used vendor docs and READMEs.
- **VERIFIED** means the docs page was read.
- **UNVERIFIED** means the claim comes from search snippets only.
- Nothing below has been tested from Wesam yet.

## Tier 1: required (we build it)

### Hesba calculator MCP (`hesba-calculator`)
- The contract is in `specs/spec.md` §2. Tools: `price_product`, `cpa_table`,
  `price_bundles`, `check_campaign`.
- **Built 2026-09-16** (`engine/`, `server/`). **Deployed 2026-09-17** to
  https://hesba-calculator.hesba.deno.net (Deno Deploy org `hesba`, region global). The path
  token is a Deno Deploy secret.
  It is the only source of numbers; without it, Bya3 refuses to give numbers, by design.
- Hosting: Deno Deploy. URL: `https://hesba-calculator.hesba.deno.net/mcp/<token>`. Read-only annotations.
- Wesam setup: Name `Hesba Calculator`, include `*`, exclude nothing. **Connected to Bya3 on
  2026-09-17** (Test found 5 tools).

## Wesam integrations in use
- **Bright Data** (connected 2026-09-17). All 10 actions are enabled:
  - SERP Search, Web Unlocker
  - Trigger Site Crawl, Check Crawl Status, Download Scraped Data
  - Browse Available Scrapers, Filter Dataset
  - List Unlocker Zones, Get Available Countries / Cities

  Bright Data zones (both active, created 2026-09-17; the user added a payment method):
  - **`hesba_serp`** (SERP API, **Full JSON** format, $1.50/CPM). Raw HTML returned a ~13 KB
    Google block page that the agent read as a "CAPTCHA"; Full JSON fixed it.
  - **`hesba_unlocker`** (Web Unlocker API, $1.50/CPM).
  - **Monthly cap (2026-09-17):** 3,333 requests per zone (= $5 at $1.50/CPM; Bright Data
    requires a dollar cap above $10, so the cap is set in requests). On breach: suspend the zone
    and send an alert.

  It is used by the `hesba-competitor-check` skill. It is shared with every agent in the
  workspace.

## Tier 2: optional data sources (read-only, the seller signs in)

| Priority | Server | Endpoint | Auth | Tools to allow | Status and risks |
|---|---|---|---|---|---|
| 1 | **Meta Ads MCP** (official) | `https://mcp.facebook.com/ads` | Meta Business OAuth | Reporting/insights only | VERIFIED endpoint. It also has create/edit tools, so exclude them with globs (see below). Whether Meta accepts Wesam as an OAuth client is untested. |
| 2 | **TikTok for Business MCP** (official) | `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer` | OAuth | Reporting only | VERIFIED URL (use `layer`, about 40 tools, not `flat`, about 400). Whether it is generally available and how auth works is UNVERIFIED. |
| 3 | **Google Sheets MCP** (official) | `https://sheetsmcp.googleapis.com/mcp/v1` | OAuth with your own GCP client | `get_values`, `get_spreadsheet` | VERIFIED, but **Developer Preview only** (the GCP project must be enrolled). Gives access to order and courier sheets. |
| 4 | **Pipeboard Meta / Google Ads** (community, Meta Business Partner) | `https://meta-ads.mcp.pipeboard.co/`, `https://google-ads.mcp.pipeboard.co/` | OAuth (Pipeboard account) | `get_insights`, `get_campaigns`, `get_ads` | VERIFIED, and listed in the official MCP registry. A third party sits in the data path. Fallback if Meta's own server rejects Wesam. |
| 5 | **MCP for WooCommerce** (w7s plugin) | `https://{store}/wp-json/woocommerce/mcp` | Token in the URL (not OAuth) | Order and product listing | VERIFIED. Must use a read-only API key. |

**Not usable today:**
- **Snap Ads MCP** (`https://mcp.snapchat.com/ads`) only accepts pre-registered AI clients, and
  Wesam isn't one.
- **Google Ads official MCP** has to be self-hosted and needs a developer token.
- **Salla** (community) supports SSE only.
- **Zid, EasyOrders, YouCan**: no MCP server exists.
- **Regional couriers** (Bosta, Aramex, J&T, SMSA, Mylerz): no MCP server exists. Use the
  seller's courier export as a file upload or a Google Sheet instead.
- **FX rates**: the remote FX MCP servers use ECB rates, which **don't cover EGP or the Gulf
  currencies** (checked against the Frankfurter API on 2026-09-16). **Decision:** no FX tool.
  The seller gives prices in one currency; Bya3 asks rather than converting.

### Suggested exclude globs for ad servers
The ad servers above include write tools, so exclude:
```
create_*, update_*, delete_*, pause_*, enable_*, set_*, upload_*, duplicate_*, *_budget*, *_bid*
```
Wesam already blocks spend, publish and send actions. After connecting, check each server's
tool list and adjust.

## Build order
1. `hesba-calculator`: blocks everything, and is the only must-have for the demo.
2. Meta Ads MCP: connection test only, to find out whether Wesam's OAuth is accepted. If it
   is, the weekly check can pull the budget spent and leads directly.
3. Google Sheets: only if the Developer Preview enrollment is quick. Otherwise, file uploads
   are enough for the demo.

## Open questions to test inside Wesam
- ~~Can a tool server run with no OAuth?~~ **Yes.** hesba-calculator connected on 2026-09-17 with "no sign-in needed".
- Do Meta and TikTok accept Wesam's OAuth client?
- Does Wesam support SSE-only servers?
- How does Wesam handle servers that need your own OAuth client ID and secret (Google)?
