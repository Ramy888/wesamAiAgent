# Spec: pricing for a seller who is new to selling online

Status: **spec, 2026-09-23.** Needs engine code, so nothing is built until you say build.
This is the first request in the project that genuinely needs a new calculator tool.

## 1. What was asked

> A seller new to online selling gives the market and the product cost, plus any other costs
> they happen to know. From the market, the competitors and the ads for that product, Bya3
> recommends a price, shows likely delivery and return costs, and then a table: at price X the
> margin is critical, at Y the margin, revenue and profit are these numbers, at Z these — with
> the competitors' prices in the same table. No equations, no technical detail, almost no
> prose: tables, charts and inline media.

## 2. The flow (three questions, then an answer)

1. **Which country?**
2. **What does the product cost you?**
3. **Anything else you already know about your costs?** (free text; whatever they name is used,
   whatever they don't is filled from §3 and shown as an assumption)

Then: read the market (competitor prices via the existing search and page tools), fill the
remaining costs from the market defaults, call the new tool, and answer with a table, a chart,
and one line of advice.

## 3. Market defaults — sourced 2026-09-23, and mostly empty

`reference/market-defaults.json` now exists, built from courier pages that were actually
fetched, each figure carrying its source. **The research changed what this feature can
promise**, so the flow below is built around absence, not around defaults.

| Market | Delivery fee | Return fee | Confidence |
|---|---|---|---|
| **Egypt** | 45–140 EGP, typical 97–110 (Bosta list, by zone, before VAT) | **87 EGP**, published flat | high |
| **Morocco** | 18–50 MAD by city, ~35 typical | **0 MAD** — returns are genuinely free at three couriers | high |
| **UAE** | 17.31–35 AED (two published prices differing ~2×) | **a rule, not a number:** a return is charged the full delivery fee. COD costs 2.5% of the value collected | high |
| **Saudi** | 20–25 SAR excl. tax, first 10 kg, via the Zid platform | not published | medium |
| Bahrain, Kuwait, Qatar, Oman, Jordan | **nothing published** | nothing | none |
| The other 10 markets | not researched yet | — | none |

**Confirmation and delivery rates have no public source in any market**, so they are `null`
everywhere. They come from the seller session (`docs/seller-intake.md`) or they get asked.

Consequences for the flow:
- In Egypt, Morocco, the UAE and Saudi, Bya3 can offer a delivery cost and say where it came
  from. Everywhere else it **asks**, because there is nothing honest to assume.
- Egypt's numbers are a **ceiling**: Bosta's page says "higher volume, lower price" and its own
  signup flow shows lower figures that couldn't be verified without an account. That
  discrepancy is recorded rather than resolved.
- Every seller sees the default it used and can correct it in one line.

## 4. New tool: `price_scenarios`

**Inputs:** the usual product costs and rates, the market, an optional list of confirmed
competitor prices, and an optional volume assumption.

**The price ladder is generated in code, never by the model:** the breakeven price, the safe
price, the seller's own price if they gave one, each competitor's price, and a ladder around
the safe price (−20%, −10%, +10%, +20%). Duplicates collapse; the list is sorted.

**Output — one row per price:**

| Column | Meaning |
|---|---|
| `price` | The price being tested |
| `who` | `you`, `market`, or the competitor's label — so competitors sit in the same table |
| `profitPerOrder`, `marginPct` | At that price |
| `revenue`, `profit` | At a fixed, stated volume (see below) |
| `band` | `critical` / `thin` / `healthy` / `above target` |
| `sourceUrl` | For competitor rows |

**Volume must be stated or the revenue column means nothing.** Per-order revenue is just the
price. The table is quoted **per 1,000 currency units of ad spend**, because that is how a COD
seller thinks: this much spend buys this many leads, which become this many delivered orders,
this much revenue and this much profit. The assumed spend appears in the assumptions line.

**Band thresholds are constants in code, with a test each**, and they must agree with the
existing verdicts: a price below breakeven is always `critical`, and a price the existing tool
calls "below target" is never `healthy`. Two tools must never disagree about the same price.

## 5. What the seller sees

A verdict line, a table, a chart, one action. No paragraphs.

```
لو بعت بـ 300 → الربح ضعيف. أحسن سعر ليك: 345

| السعر | مين | الربح/أوردر | الهامش | الإيراد /1000 إعلان | الربح /1000 إعلان |
| 279   | متجر A | −12 | −4%  | … | … |   ← خسارة
| 300   | إنت    | 2   | 0.7% | … | … |   ← ضعيف
| 345   | المقترح| 34  | 10%  | … | … |   ← كويس
| 380   | متجر B | 58  | 15%  | … | … |
```

Plus a `scenarios` chart: price along the bottom, profit per order up the side, the loss zone
shaded, a marker for each competitor, and the safe price highlighted. Same signed-SVG system
and the already-validated status colours.

**The distinction that must not get flattened:** never show formulas, equations or method —
that rule stands. But **always show assumptions**: which delivery fee, which confirmation
rate, which ad spend the table assumes. Hiding what a number depends on is a different thing
from hiding how it is calculated, and a beginner needs the first to sanity-check their own
business.

## 6. Where it lives

A 7th menu item, "I'm new — help me price this", **and** the same scenario table becomes the
default shape of a `price_product` answer whenever confirmed competitor prices exist. That
gets most of the value without forking the instructions into a beginner mode and an expert
mode.

## 7. Tests (written before the code, per CLAUDE.md)

`tests/scenarios_test.ts`:
- the ladder is deterministic, sorted, de-duplicated, and identical across runs;
- every band threshold, including the boundaries;
- a price below breakeven is always `critical`;
- every row's margin matches `price_product` at that same price — the two tools cannot
  disagree;
- revenue and profit match the stated volume;
- competitor rows keep their labels and source links;
- the chart carries exactly the table's numbers, mirroring `chart_test.ts`;
- independent expected values in `tests/oracle/oracle.py`;
- a text test asserting no equation ever reaches the seller.

## 8. Build order, when you say go

1. ~~Source the market defaults~~ — done 2026-09-23. Four markets have data; the rest ask.
2. Failing tests.
3. The tool, then the chart, then the instructions.

Item 13 on the outstanding list, and still behind item 4: a real seller's numbers are what fill
the confirmation and delivery bands that this feature depends on.
