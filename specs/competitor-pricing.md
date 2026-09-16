# Idea: compare the seller's price with competitors' prices

Status: brainstorm, 2026-09-16 (updated 2026-09-17). Not scheduled. Build it after the core calculator is live.

## Why it's valuable
The first question a COD seller asks after "what's my breakeven?" is "what are others charging?".
Combining the two turns a number into a decision: "Competitors sell at 279–349. Your breakeven
is 297, so you can't win on price; compete with a bundle instead."

## What's feasible (checked 2026-09-16)

| Source | Can we use it? | Why |
|---|---|---|
| **Meta Ad Library API** | ❌ for Egypt, the Gulf and MENA | The API returns political and issue ads worldwide, but ordinary ads **only when delivered to the EU or UK**. |
| **TikTok Commercial Content API** | ❌ | EU/UK data only, and access is limited to approved researchers. Commercial users are ineligible. |
| Scraping the public Ad Library or TikTok Creative Center pages | ❌ (avoid) | Against the platforms' terms, brittle, and it risks a hackathon entry. Prices are also usually inside images or videos, not in text. |
| Meta / TikTok Ads MCP servers (see `tools.md`) | ❌ for this purpose | They only expose the **seller's own** account data. |
| **Seller-supplied evidence**: screenshots of competitor ads, product-page links, WhatsApp price lists | ✅ | Bya3 already has vision and web browsing in Wesam. The seller chooses what to share. |
| **Public store and marketplace pages** (Noon, Amazon.eg/.sa, Jumia, Salla/Zid/Shopify stores) viewed one at a time | ✅ with care | Bya3 opens a few links the seller gives, or finds them through web search. Reads the listed price only. No bulk crawling. Check each site's terms. |

## Update 2026-09-17: the agent finds competitors itself, using Wesam integrations
Asking the seller to collect competitor ads is too much work. Wesam's Integrations page has
1,543 integrations, and these fit the job. All of them need to be **connected once per
workspace**, usually with the provider's API key and paid credits. Nothing is connected yet,
and Wesam doesn't show an integration's action list until it is connected.

| Step | Integration (as listed in Wesam) | What it gives | Status and risk |
|---|---|---|---|
| 1. Find competitor ads | **ScrapeCreators** (Connect) | Public ads from social platforms. Its Meta Ad Library endpoint searches by **keyword + country** and returns ad copy, creatives and the advertiser ([docs](https://scrapecreators.com/facebookAdLibrary-api)) | Third-party scraper of Meta's public library (a terms grey zone, carried by the provider). Paid credits. The TikTok ad library covers the EU/UK/TR only. |
| 1 (alternative) | **Search api** (Connect; SearchApi.io has a `meta_ad_library` engine with a country filter, [docs](https://www.searchapi.io/docs/meta-ad-library-api)) · **Apify** (Connect; Facebook/TikTok ad-library actors) · **Bright Data** | Same data | It's unverified whether Wesam's "Search api" integration exposes the ad-library engine. Apify MCP is "coming soon". |
| 2. Read the real price | **Firecrawl** / **Browserbase MCP** / **Olostep** (Connect) | Opens each ad's landing page (EasyOrders, YouCan, Shopify, …), where COD prices are shown plainly | Much more reliable than reading prices from ad images. |
| 2 (backup) | Agent **vision** (already on) | Reads the price from the ad creative when there's no landing page | Noisy, so show the evidence and a confidence level. |
| 3. Market shelf prices | **Composio Search** (e-commerce search incl. Amazon) · **OpenWeb Ninja** (product search) · **ASIN Data API** (Amazon) · **SerpApi** (Google Shopping) | Marketplace prices for the same product | Coverage for amazon.eg/.sa/.ae, Noon and Jumia is unverified. |
| 4. Currency (optional) | **Fixer** / **CurrencyScoop** (Connect) | Exchange rates for 170 currencies, including EGP and the Gulf currencies | Only for cross-market comparisons. The calculator itself stays in a single currency. |
| 5. Compare | **Hesba `compare_prices`** (to build) | Deterministic positioning and verdict | Our own code; tested like the other tools. |

Not usable for competitors:
- **Meta Ads / Google Ads** (Connect): the seller's own account only.
- **TikTok Ads / Snapchat**: "coming soon", and also own-account only.

**New flow.** The seller just says: "I sell product X in Egypt at 300."
1. ScrapeCreators searches ads for X in Egypt → the top 5–10 active advertisers.
2. Firecrawl reads each landing page's price (Composio Search adds marketplace prices).
3. Bya3 shows the evidence table (source link, price, pieces, date) and asks one question:
   "Use these?"
4. `compare_prices` returns the positioning.
5. Bya3 gives the verdict and the action.

Workflow fit: a **weekly or monthly "Competitor watch"** is a natural scheduled Wesam
workflow, because it needs no new seller input after setup.

**Costs and risks**
- Every connected integration uses the workspace's own paid API credits.
- A judge's workspace would need the same connections (a G4 impact).
- Keep a fallback: Bya3's built-in web search and browsing, with no integration at all.

## Recommended design (original, seller-supplied fallback)
1. **Collect (agent side, no new code).** The seller shares 3–10 competitor ads or links. Bya3
   reads each one and fills a table: competitor, price, pieces in the offer, shipping included
   (yes/no), source, and date seen. Bya3 repeats the table back and gets a "yes" (the same
   rule as for campaign screenshots). If a price is unclear, Bya3 asks instead of guessing.
2. **Compare (new deterministic tool: `compare_prices`).**
   - Input: the product fields, plus `competitors: [{label, totalPrice, pieces, shippingIncluded}]`.
   - For each competitor:
     - normalized price per piece, adjusted for shipping if the seller gives their own
       delivery fee
     - the seller's net profit and margin if they matched that price
     - the max CPA at that price
     - a verdict (LOSS / BELOW_TARGET / ON_TARGET)
   - Summary:
     - min, median and max competitor price
     - where the seller's price and suggested price sit in that range
     - the lowest price that still meets the target margin (the suggested price) and the
       breakeven price
     - a recommended band: `max(suggested, P25)` to `median` when that band exists; otherwise
       "can't compete on price", which routes to `price_bundles`
3. **Advise (agent).** Give one verdict and one action, for example:
   - "Match at 329: still 11% margin."
   - "Don't undercut. Offer 2 for 599; you earn 88 per order."
   - "Your cost is too high for this market; renegotiate the product cost to X." X comes from
     a reverse cost calculation, which could be a later addition to the tool.
4. **Workflow (optional).** A monthly "Competitor price check" in Wesam: the seller re-shares
   links, and the report compares against last month (artifact_search).

## Risks and guardrails
- **Unverified prices.** Always show the source and date for each price. Never state a
  competitor price before the seller confirms the evidence table.
- **"Was" prices and discounts** in ads are often fake. Compare against the price customers
  actually pay.
- **Shipping.** Many COD ads say "free shipping". Normalize it before comparing.
- **Pieces and quality differ.** The comparison is by piece count, not quality. Say so.
- **Legal.**
  - We never scrape anything ourselves. Ad and page data comes only through third-party
    integrations the workspace chose to connect, whose providers carry their own platform
    terms risk.
  - Keep volume low (one seller request means a handful of lookups).
  - Store competitor data only in the seller's workspace.
  - Tell the seller which provider the data came from.

## Effort estimate
- `compare_prices` tool: small (same engine, about 1 file plus tests).
- Skill `hesba-competitor-check` (how to read ad screenshots and normalize prices): small.
- A good demo moment for the video: "Here are 5 competitor ads → Bya3 says don't undercut,
  offer a bundle."
- **Suggested timing:** after the MCP server is deployed and connected. Optional on Oct 1–3
  only if the core is finished early.

Sources:
- [Meta Ad Library tools (Transparency Center)](https://transparency.meta.com/researchtools/ad-library-tools/)
- [Meta Ad Library API](https://www.facebook.com/ads/library/api)
- [TikTok Commercial Content API](https://developers.tiktok.com/products/commercial-content-api)
- [TikTok newsroom: Research API and Commercial Content Library](https://newsroom.tiktok.com/en-gb/tiktoks-research-api-and-commercial-content-library)
