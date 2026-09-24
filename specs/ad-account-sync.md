# Spec: read the seller's own ad account

Status: **spec, 2026-09-24.** Investigated against the live TikTok Ads connector in Wesam. The
headline finding changes the plan, so read §2 before building anything.

## 1. Why this is worth more than competitor data

Today a seller types twelve numbers for every campaign check: spend, leads, confirmed,
delivered, plus the unit costs. That typing **is** the 20 minutes a week we claim to save. If
Bya3 reads the ad half itself, the check becomes "confirm two numbers" — and the hours-saved
figure on the impact slide stops depending on how fast someone types.

This is the seller's **own** account, connected by them through OAuth. No scraping, no terms
problems, no estimates about anyone else.

## 2. What the TikTok Ads connector actually exposes (checked 2026-09-24)

Connected in the Hesba workspace; **142 actions enabled**. What's there, and what isn't:

**Available and useful**
- `List Campaigns`, `List Ad Groups`, `List Ads` — names, status, structure
- `Get Advertiser Accounts`, `List Business Center Advertisers`
- `Get Advertiser Balance`, `List Advertiser Transactions`, `List Advertiser Budget Changes`
- `Get Ad Benchmarks` — benchmark dimensions and "dynamic numeric metrics", scoped to specific
  ad or ad-group IDs
- `Get GMV Max Report`, `Get Smart+ Material Report` (+ Breakdown, Overview)

**Missing, and it's the one we need:** there is **no general performance report** — nothing
equivalent to TikTok's integrated report endpoint that returns spend, impressions, clicks and
conversions per campaign for a date range. The only reports are for **Smart+ and GMV Max**
campaigns specifically. A seller running ordinary campaigns can't get their weekly spend out
of this connector.

**A safety problem to fix first:** the 142 enabled actions include write actions such as
`Update Advertiser Budgets`, `Set Smart+ Campaign Delivery Status`, `Update Smart+ Ad Status`
and `Disable Business Center Advertiser`. Bya3 must never change a budget or pause a campaign
on its own — it advises, the seller acts. **Disable every write action on this integration
before Bya3 is allowed near it**, and keep only the read actions listed above.

## 3. Options, given the gap

| Option | Gets us spend per campaign? | Cost | Verdict |
|---|---|---|---|
| **A. Use the connector for structure only** — Bya3 lists the seller's live campaigns by name and asks for the numbers per campaign | No, but it removes the "which campaigns do I have" step and lets Bya3 ask precisely | Free, works today | ✅ **do this** |
| **B. Smart+ / GMV Max reports** | Yes, but only for sellers running those campaign types | Free | ✅ use when the seller has them |
| **C. Ask Wesam to add the reporting action** (the integrations page has a "request integration" button) | Yes, if they add it | Free, unknown timing | ✅ ask now, don't wait for it |
| **D. Our own MCP tool calling TikTok's API with the seller's token** | Yes | Real work, and **we'd have to hold each seller's token** | ❌ **no** — the tenant-identity finding (`specs/product-review.md` §4) means we can't tell one workspace's calls from another's, so we must never hold per-seller credentials |
| **E. Read a screenshot of Ads Manager** | Yes, as well as the seller's eyesight | Free, already possible | ✅ keep as the fallback it already is |

## 4. The flow, once built

1. Seller asks for a campaign check.
2. Bya3 calls `List Campaigns` (and `List Ad Groups` when needed) and shows the live ones by
   name, with status and daily budget.
3. For a Smart+ or GMV Max campaign, it pulls the report and fills spend itself.
4. Otherwise it asks for **spend and leads** for the chosen campaign and week.
5. It always asks for **confirmed and delivered counts**, because no ad platform knows them —
   in cash-on-delivery, confirmation happens on the phone and delivery happens at the door,
   days later. This is the part that cannot be automated away, and it's exactly where the
   money is decided.
6. `check_campaign` as today, with the verdict and the chart.

## 5. Meta and Google

Both connectors exist in Wesam and both failed to open on 2026-09-24 (pages error or don't
load). Re-check later; if Meta's connector exposes a general insights action, it closes the
gap that TikTok's leaves open, since Meta's API does publish spend and results per campaign.

## 6. Scope note

Bya3 serves **19 markets across Egypt, the Gulf and the wider MENA region** — not Egypt alone.
Campaign structure and currency come from the seller's own ad account, so nothing here is
Egypt-specific, but the ad platforms' regional availability differs and should be checked per
market before this is promised in the listing.

## 7. Open questions

1. Can Wesam add TikTok's integrated report action on request, and how fast?
2. Does the Meta Ads connector expose insights? (blocked by the loading error)
3. Which campaign types do real sellers actually run — Smart+ or classic? The seller session
   (item 4) answers this, and it decides whether option B covers anyone at all.
