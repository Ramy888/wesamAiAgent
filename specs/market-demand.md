# Spec: market demand — competitor keywords, share of voice, and how much they sell

Status: **spec only, not scheduled.** Written 2026-09-20 at the user's request. Build during
Oct 1–3, and only once items 4 (a real seller) and 7 (judge access) are moving. No code yet.

Companion to `specs/competitor-pricing.md`, which covers competitor **prices**. This covers
competitor **demand**: which phrases they win, and how much they appear to sell.

## 1. What the seller asked for

> "I want to show the seller the keywords competitors use, their traffic, and how many units
> they sold of the product he is asking about."

Split into three asks, because their feasibility is very different:

| Ask | What is actually obtainable | Honest label |
|---|---|---|
| How many sold | A proxy: a platform's own sold count, or a review count, or how long an ad has been running | **Estimate with a confidence level**, never a sales figure |
| Keywords | (a) the phrases shoppers search, and (b) the hooks competitors use in ads | (a) is easy, (b) depends on §4 |
| Traffic | Which competitors appear for which phrases, as a **share of voice** percentage | Relative, not visits per month |

## 2. What the seller sees

A section after the price comparison, in the answer language, with a source link per row.
Layout, using made-up placeholders:

```
Demand for this product (Egypt) · as of 20 Sep
- Searches are rising: interest is up about a third over 3 months.  [source]
- Phrases shoppers use: "مكواة بخار محمولة" · "مكواة بخار للملابس" · "مكواة سفر"
- Who owns those phrases: Store A 40% · Store B 25% · you 0%
- How much they move:
  Store A  ~120–260 orders/month   medium confidence · based on reviews   [source]
  Store B  no evidence found       —                                        [source]
  Store C  an ad running 74 days   the ad is paying for itself              [source]
```

Rules for this section:
- A number is never shown without its confidence and its basis.
- A range, not a single number, whenever the basis is indirect.
- "No evidence found" is a valid, expected answer and must be shown, not hidden.
- The method behind an estimate (the multipliers) is **not** revealed, per the existing rule
  about not teaching the method. "Based on reviews, medium confidence" is the right amount.

## 3. Hard rules

1. **No estimated demand number ever enters the profit math.** The calculator's credibility
   rests on every number being exact. A demand estimate lives in its own section, carries its
   source and confidence, and is never an input to price, margin or CPA. If a seller wants to
   plan volume, they type their own number.
2. **All arithmetic stays in the MCP tool.** Afandina gathers observations; the tool counts,
   ranks, divides and rounds. Same rule as everywhere else in this project.
3. **Every row cites a link.** No link, no row.
4. **A request budget per check** (§6), so a single question can't burn the monthly cap.

## 4. Sources, and what still needs checking

| Source | Gives | Status |
|---|---|---|
| Search results via the existing Bright Data SERP zone | Which competitors rank for which phrase; related searches; autocomplete phrases | ✅ available today |
| Marketplace listing pages (Amazon.eg/.sa, Noon, Jumia) via the Unlocker zone | Review counts, rating counts, and sometimes a stated sold count | ✅ available, read one page at a time |
| AliExpress / Temu listings | A stated "X sold" | ✅ available, but these are cross-border sellers, so treat as category demand, not local competition |
| Google Trends | Direction of demand over time, relative | ⚠️ **verify** the SERP zone can reach it; otherwise drop |
| Amazon "bought in the past month" badge | A stated monthly sold count | ⚠️ **verify** it appears on amazon.eg and amazon.sa |
| Google Keyword Planner | Real monthly search volume per phrase | ❌ for now: needs a Google Ads account and API approval. **Open question for the user.** If they have an account, this upgrades share of voice into real volumes |
| Similarweb / Semrush / Ahrefs | Domain traffic estimates | ❌ paid, and weak coverage of Egyptian and Gulf sites |
| **Meta Ad Library** (ad hooks, ad longevity) | The single best signal for independent COD stores | ❌ **unresolved.** `specs/competitor-pricing.md` (2026-09-16) ruled out scraping it as against the platform's terms and a risk to the entry. A licensed third-party API (ScrapeCreators, Apify) moves the scraping to a vendor but doesn't clearly resolve the terms question. **Decide before building; default is to leave it out.** |
| TikTok Creative Center | Trending products by country | ⚠️ **verify** Egypt and Gulf coverage |

If the Ad Library stays out, the feature still works: it loses ad hooks and ad longevity, and
keeps search phrases, share of voice, and marketplace sales proxies.

## 5. Tool contract: `market_demand`

Follows the same shape as `compare_prices`: the agent passes what it observed, the tool does
the rest. Structured output is rounded to 4 decimals, with AR/EN/FR text, as elsewhere.

**Inputs**
- `market` (country code) and `lang`, as in the other tools.
- `productQuery`: the phrase the seller uses for the product.
- `keywords[]`: the phrase variants the agent searched, each with the results it saw
  (`rank`, `domain`, `title`, `url`, and whether it was an ad).
- `listings[]`: one row per competitor listing the agent opened — `label`, `url`, `platform`,
  `observedAt`, and any of `reviewCount`, `ratingCount`, `statedSoldCount`,
  `statedSoldWindow`, `firstReviewDate`.
- `ads[]` (only if §4 resolves): `label`, `url`, `firstSeen`, `lastSeen`, `variantCount`,
  `headline`.
- `assumptions` (optional): lets a seller override the orders-per-review range.

**Outputs**
- `keywords[]`: phrase, how many competitors compete for it, whether the seller appears.
- `shareOfVoice[]`: competitor, the share of tracked phrases they appear in, weighted by
  position, and the same figure for the seller. Percentages sum to 100 across tracked names,
  with an explicit `other` bucket.
- `demand[]`: one row per competitor — `basis` (`stated` | `reviews` | `adLongevity` |
  `none`), `estimateLow`, `estimateHigh` (both `null` when `basis` is `none`), `confidence`
  (`high` | `medium` | `low`), `observedAt`, `sourceUrl`.
- `trend`: direction and rough magnitude, or `null`.
- `assumptionsUsed[]` and `warnings[]`, as in the other tools.
- `charts[]`: see §7.

**Estimation precedence** (first one that applies wins, and the row records which):
1. A platform's own stated sold count for a stated window → `high`.
2. Review or rating count → a range from a configurable orders-per-review band, reported as
   an assumption → `medium`. A single snapshot gives a **lifetime** figure, not a monthly one,
   and must be labelled that way.
3. Ad longevity → no unit estimate at all, just "running N days, M versions live" → `low`.
4. Nothing → `null` plus a warning. **Never** a guessed number.

**Warning codes** (new): `NO_DEMAND_EVIDENCE`, `SINGLE_SNAPSHOT_LIFETIME_ONLY`,
`CROSS_BORDER_SELLER`, `TREND_UNAVAILABLE`, `AD_SOURCE_DISABLED`.

## 6. Request budget

The two Bright Data zones are capped at 3,333 requests a month each (about $5). One check
must therefore stay small:

- at most 6 search phrases,
- at most 8 competitor pages opened,
- at most 2 extra calls (trend, autocomplete),
- **hard ceiling: 16 requests per check**, and Afandina says how many it used.

At that size, the monthly cap allows roughly 200 checks.

## 7. Charts

Two more kinds in the existing signed-SVG system, same palette and bilingual labels:

- `voice`: a horizontal bar per competitor, the seller's own bar highlighted, with an "other"
  bar. Sorted, longest first.
- `demand`: a range strip per competitor — low to high, with a dot for a stated figure —
  plus a dash and the words "no evidence" where nothing was found. The confidence level is
  printed as text next to each row, never conveyed by colour alone.

## 8. Phases

- **v1 (in the build window):** search phrases, share of voice, marketplace proxies, the two
  charts, one snapshot only.
- **v2 (after the hackathon):** growth over time. This needs two readings weeks apart, which
  needs storage the stateless server doesn't have. Deno KV is the likely home — **verify it
  is available on the new Deploy setup** — fed by the existing weekly workflow.
- **v3:** ad hooks and ad longevity, if and only if §4 resolves.

## 9. Test plan additions

Mirrors `tests/compare_test.ts`:
- share-of-voice percentages sum to 100 with the `other` bucket, including ties and a single
  competitor;
- each estimation precedence branch, including the `none` branch returning `null` plus the
  warning;
- a cross-border listing raising `CROSS_BORDER_SELLER`;
- rounding and currency-free integer formatting;
- charts carry exactly the numbers in the result, as `chart_test.ts` already asserts;
- independent expected values in `tests/oracle/`;
- a text test proving no multiplier or formula appears in the user-facing strings.

## 10. Open questions

1. Does the user have a Google Ads account? It's the difference between real search volumes
   and a relative share of voice.
2. Is the Meta Ad Library in or out (§4)? Default: out.
3. Three checks before any of this is promised to a judge: Google Trends reachability, the
   Amazon badge on the Egyptian and Saudi sites, and TikTok Creative Center coverage.
