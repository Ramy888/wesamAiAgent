# Test plan — pricing engine + MCP server

Status: **draft v0.1**, 2026-09-16. Contract: `specs/spec.md`.

Runner: `deno test` (`deno task test`).

- All numeric comparisons: `|actual − expected| ≤ 1e-4` unless stated otherwise.
- Every test that encodes a formula change must **fail first**: revert the change, watch it
  fail with the expected message, then restore.

## Layers

| Layer | File(s) | Oracle |
|---|---|---|
| P: parity | `tests/parity_golden_test.ts` | `reference/golden.json` (real Dart engine output) |
| C: canonical | `tests/canonical_test.ts` | Hand/independent calculations (values below were computed with a separate Python script, not the engine) |
| E: edge cases | `tests/edge_test.ts` | Stated expected behaviour |
| V: validation | `tests/validation_test.ts` | spec §2.4 |
| M: MCP protocol | `tests/mcp_test.ts` | spec §2.1–2.5, in-process `fetch` handler |
| X: end-to-end | manual checklist | Wesam Test button + chat |

## P — parity against `golden.json`

The loader reads `golden.json`. For each mode it maps `input` to the engine's input type and
compares **only** the relevant fields below. Fields that don't apply are emitted as `0.0` in
the golden file and are not asserted.

**Core fields**, asserted in all 5 modes (16 fields):
- `totalCostPerUnit`
- `suggestedPrice`
- `breakevenPrice`
- `netProfit`
- `netMarginPct`
- `grossProfit`
- `maxCpa`
- `breakEvenRoas`
- `successRatePct` (the engine's `successRate × 100`)
- `leadsPerDelivered`
- `adCostPerDelivered`
- `blendedShipping`
- `operationsCost`
- `leadProcessingCost`
- `fixedCostsPerDelivered`
- `pctStack`

| ID | Mode | Extra fields | List assertions |
|---|---|---|---|
| P1 | `cpaMatrix` | none | `cpaMatrixRows` length **8**, in order of margin 20,15,10,5,0,−5,−10,−20; each row's `cpaLocal`, `cpaEgp`, `cpaUsd` (= egp/50), `isViable` |
| P2 | `reverseCalc` | `requiredPrice`, `requiredCr`, `breakevenMaxCpa`, `survivalCr` | `bundles` length **18**, order n ∈ {2,3,4} × d ∈ {0,10,20,30,40,50}; all 7 bundle fields |
| P3 | `advancedPnl` | `expectedPnl`, `targetPnl`, `breakevenPnl` | `bundles` length **3** (n = 2,3,4 with d = 5,10,15) |
| P4 | `ultimatePricing` | none | `bundles` length **3**; `cogsBreakdown` length **7**, labels in exact order |
| P5 | `plTracker` | `revenue`, `totalCogs`, `actualCpa`, `cpl`, `crPct`, `drPct`, `roas`, `rtoCount` | `cogsBreakdown` length **10**, labels in exact order |

**Anchor asserts:** these duplicate some P4 values on purpose, so a broken loader can't pass
the suite silently.

| Field | Expected |
|---|---|
| suggested | 345.2273 |
| breakeven | 296.9438 |
| netProfit | 34.5227 |
| netMarginPct | 10.0 |
| maxCpa | 24.3211 |
| BE ROAS | 3.8325 |
| pctStack | 0.285 |
| leadProcessing | 9.2593 |

**Parity traps.** These assert Bine's *current* behaviour. They are not fixed in `parity.ts`.

| ID | Trap | Evidence in golden |
|---|---|---|
| T1 | CPA Matrix headline is at the *suggested* price; rows are at the *entered* price (bug #4) | `maxCpa` 12.0 vs row(0%) `cpaLocal` 70.0 |
| T2 | CPA Matrix rows use `price − productCost − deliveryFee` (no customs, not blended) | row(20%) = (300−125−60)·0.4 = 46.0 |
| T3 | CPA Matrix marks negative-margin rows viable (bug #9) | row(−20%) `isViable: true` |
| T4 | Reverse bundles use `deliveryFee` (25), not blended (20) (bug #5) | n=2,d=0 profit = 600 − 225 − 37.5 = 337.5 |
| T5 | Reverse headline uses the simple model while `suggestedPrice` uses the full model | `netProfit` 137.5, `grossProfit` 175 vs `suggestedPrice` 196.875 |
| T6 | Advanced P&L stack = VAT + marketer only (0.18); packaging/call-center/SMS ignored; fulfillment ÷ DR; headline metrics at the entered price | `pctStack` 0.18, `totalCostPerUnit` 221.1111 |
| T7 | Tracker `grossProfit = revenue − productCosts` (bug #6) | 8000 |
| T8 | Tracker `suggestedPrice` = entered price; `breakevenPrice` = 0 and `maxCpa` = 0 (placeholders) | 300 / 0 / 0 |
| T9 | Tracker `successRatePct`/`leadsPerDelivered` come from the *input* CR/DR (50/80), not the actuals | 40 / 2.5 |

**Coverage gap for T9.** In the golden fixture the input CR/DR happen to equal the actual
rates (50/100 and 40/50). So a port that wrongly used the actual rates would still pass. Add one
hand case where they differ, e.g. input CR 60, DR 45 with the same counts. Expected:
`successRatePct` = 27.0, `leadsPerDelivered` = 3.7037, `crPct` still 50, `drPct` still 80.

**Other gaps in the golden fixtures:**
- cpaMatrix has `leadCpa = 0`, so ad cost is never exercised there.
- customs = 0 in every mode except ultimate.
- no non-default bundle settings anywhere.

**Proposed fix:** extend `reference/golden.dart` with a second fixture set per mode (for
example, the ultimate inputs fed to every mode) and regenerate with the command in CLAUDE.md §7.
That runs Dart inside the Bine repo, so it needs your OK.

## C — canonical model (spec §2.6)

Fixture **U** = the golden `ultimatePricing` input: `sellingPrice` 300, `leadCpa` 15, CR 60,
DR 45, `targetMargin` 10, stack 28.5%.

Values come from an independent Python calculation. The per-delivered ops form is used, so
bug #8 is not applied.

| ID | Tool / quantity | Expected |
|---|---|---|
| C1 | `price_product` U: `suggestedPrice` / `breakevenPrice` | 345.2273 / 296.9438 (= parity) |
| C2 | `atSellingPrice.grossProfit` | 57.7407 |
| C3 | `atSellingPrice.netProfit` / `netMarginPct` | 2.1852 / 0.7284 |
| C4 | `atSellingPrice.maxCpaBreakeven` | 15.59 |
| C5 | `atSellingPrice.maxCpaAtTarget` (m = 10%) | 7.49 |
| C6 | `atSellingPrice.breakEvenRoas` | 5.1956 |
| C7 | `atSellingPrice.requiredCrPct` | 105.1051, plus warning `REQUIRED_CR_UNREACHABLE` |
| C8 | verdict | `BELOW_TARGET`, `raiseTo` 345.2273 |
| C9 | `cpa_table` U rows, m = 20…−20 | −0.61, 3.44, 7.49, 11.54, 15.59, 19.64, 23.69, 31.79; `viable` = F,T,T,T,T,F,F,F |
| C10 | `price_bundles` U default tiers | = golden ultimate bundles (570.4687 / 839.4462 / 1166.2684; profit 85.5703 / 167.8892 / 291.5671) |
| C11 | `price_bundles` U offers: 2 for 550; 3 for 780 | profit 70.9352 (12.8973%); 125.3852 (16.0750%) |
| C12 | `check_campaign`, golden tracker input, `targetMargin` 20 | revenue 12000, totalCosts 10440, contributionBeforeAds 1560, net 560, margin 4.6667, cpl 10, maxCplBreakeven 15.6, maxCplAtTarget −8.4, requiredPrice 401.0989, breakevenPrice 278.6260, verdict `FIX` |
| C13 | Consistency: net(p) at p = breakevenPrice | 0 |
| C14 | Consistency: margin(p) at p = suggestedPrice | targetMargin |
| C15 | Consistency: `check_campaign` net at price = `breakevenPrice` (C12) | 0 |
| C16 | Consistency: `maxCpa(p, 0)` = leadCpa ⇔ net(p) = 0 | (property test) |
| C17 | Monotonicity (property, random valid inputs): increasing `productCost` never increases net(p); increasing `p` never decreases net(p) when stack < 1 | — |

If you approve bug #8, C2–C9, C11 and C12 are recomputed in a separate commit, and the Python
oracle script is checked in under `tests/oracle/`.

## CP — compare_prices (`tests/compare_test.ts`, oracle-computed)

Market fixture: A 279, B 299 + 30 shipping, C 349, D 2 for 550, E 399. Seller price 300 on
fixture U.

| Check | Expected |
|---|---|
| Per-piece prices | 279, 329, 349, 275, 399 |
| Market stats | min 275, p25 279, median 329, p75 349, max 399 |
| Profit if matched | A −12.8298 (LOSS) · B 22.9202 (BELOW_TARGET) · C 37.2202 · D 70.9352 · E 72.9702 (ON_TARGET) |
| Max CPA if matched | 11.536 · 21.1885 · 25.0495 · 34.1525 · 34.702 |
| Recommendation | PREMIUM_ONLY, band [345.2273, 399]; seller BELOW_BAND; 40% of competitors cheaper |
| Other markets | PRICE_IN_BAND [357.5, 370] for 350/360/380/400; CANNOT_COMPETE for 250/260/300 (position `null`, 66.67% cheaper); NO_PROFITABLE_PRICE at 100% fees + margin; FEW_COMPETITORS when there are fewer than 3 |
| Over MCP | nested defaults (pieces 1, shipping 0), nested validation (label length, price > 0, date format), empty list rejected |

## E — edge cases (no golden data; expected behaviour stated)

| ID | Input | Parity engine | Canonical tool |
|---|---|---|---|
| E1 | CR = 0 | L = 0, ad cost silently 0 (assert current behaviour) | `isError`, field `confirmationRatePct` |
| E2 | DR = 0 | Same as E1; blended = returnFee | `isError`, field `deliveryRatePct` |
| E3 | stack + tm = 100% exactly (e.g. VAT 80 + tm 20) | suggested 0 | `suggestedPrice: null` + `STACK_PLUS_MARGIN_GE_100`; breakeven still finite |
| E4 | stack ≥ 100% | breakeven 0, suggested 0 | Both null + `STACK_GE_100`; atSellingPrice net < 0, verdict `LOSS` |
| E5 | tm = −10 | Price below breakeven | Finite; warning `NEGATIVE_TARGET_MARGIN` |
| E6 | Empty campaign (all counts 0, budget 0) | All 0, no NaN | Revenue 0, `NO_DELIVERIES`, `NO_AD_BUDGET`, ratios null, verdict null |
| E7 | delivered > confirmed | rto clamped to 0 | Same + `COUNTS_INCONSISTENT` |
| E8 | Budget > 0, delivered 0 | net = −costs − budget | verdict `PAUSE`, `actualCpa` null |
| E9 | Offer below breakeven | — | Negative profit + `OFFER_BELOW_BREAKEVEN` |
| E10 | Huge values (1e9) | Finite | Finite, JSON serialisable |
| E11 | Any tool, any valid input | — | Recursive walk: no `NaN`/`Infinity` anywhere in `structuredContent` |

## V — validation

| ID | Case | Expected |
|---|---|---|
| V1 | Missing required field (for each tool) | `isError`, `errors[].code = "required"` |
| V2 | Negative money, pct > 100, CR/DR ≤ 0 | `range` |
| V3 | Non-number / `NaN` string / `"1e999"` | `type` |
| V4 | Unknown field | `unknown_field` (catches typos like `deliveryRate`) |
| V5 | Defaults applied | Each appears in `assumptions[]` with `reason: "default"`; supplied fields never appear |
| V6 | `lang` | `ar` → Arabic text; `en` → English; numbers identical in both |
| V7 | `currency` rounding in `content` text | KWD/BHD/OMR/JOD/TND/LYD → 3 decimals, IQD → 0, others → 2. `structuredContent` is identical for every currency (the math doesn't depend on currency) |
| V8 | Unknown currency (`XYZ`), or `market` not ISO alpha-2 | `range` error |

## M — MCP protocol (in-process handler)

| ID | Case | Expected |
|---|---|---|
| M1 | `initialize` | `protocolVersion`, `capabilities.tools`, `serverInfo` |
| M2 | `notifications/initialized` | 202, empty body |
| M3 | `tools/list` | Exactly 4 tools; each has `inputSchema` and annotations `readOnlyHint: true` |
| M4 | Tool name guard, derived from `tools/list` (not a hand list) | No name matches `/publish\|send\|spend\|delete\|admin\|pay\|buy/i` |
| M5 | Schema/validator drift, derived | Every schema property is accepted by the validator and vice versa |
| M6 | `tools/call` `price_product` with fixture U | `structuredContent.result` matches C1–C8 |
| M7 | Unknown tool | JSON-RPC error; unknown method → `-32601`; malformed JSON → `-32700` |
| M8 | Stateless | Two calls with no/unknown `Mcp-Session-Id` both succeed |
| M9 | Security: wrong path token | 404 |
| M14 | `check_campaign` without CR/DR/`leadCpa` | Succeeds; supplying them changes nothing and adds no `assumptions` |
| M10 | Security: body > 32 KB | 413 |
| M11 | `GET /mcp/<token>`; bare `/mcp` | 405; 404 |
| M12 | `GET /health` | 200 |
| M13 | Logging | Captured logs contain no input values (spy on the logger) |

## X — end-to-end (manual, before recording the demo)

1. Deploy. In Wesam Agent Builder → Add MCP server → **Test** passes and lists 4 tools.
2. Chat in Arabic: price a product with the U numbers.
   - Every number in the reply appears in the tool result.
   - The verdict comes first.
   - Assumptions are listed.
3. Chat in English: a campaign check with the C12 numbers → `FIX`, with the target-CPL lever.
4. Send incomplete input → the agent asks at most 3 questions per message and never invents CR/DR silently.
5. Kill the server → the agent says the calculator is down and gives no numbers.
6. Judge path (spec §6) timed on a clean machine: under 5 minutes.

## X results (2026-09-17, Bya3 Preview chat in Wesam)

| # | Test | Result |
|---|---|---|
| X-price | Fixture U in Egyptian Arabic | ✅ All numbers match C1–C8 (2.19 / 0.7% / 296.94 / 345.23 / 15.59 / 7.49 / 105.1%); saved as the deliverable PRICE-1 |
| X-scope | "List Unlocker Zones" setup check | ⚠️ Refused by Wesam's scope harness ("not the right tool for setup checks"). Expected; not a bug |
| X-comp-1 | Competitor check with SERP zone on Raw HTML | ❌ Agent reported "CAPTCHA" (13 KB block page) → switched the zone to Full JSON |
| X-comp-2 | "مكواة بخار محمولة" in Egypt, 1 search + 4 pages | ✅ Found Amazon 224.50, Jumia 243 / 275 / 319 (plus 1 off-category, 1 404); asked for confirmation; `compare_prices` → CANNOT_COMPETE_ON_PRICE, median 259, 75% cheaper, matched profits −51.80 / −38.57 / −15.69 / +15.77 (all hand-checked); saved as PRICE-2 |
| X-chart | New product (backpack, Egypt, 450 EGP, VAT 14%) after the chart deploy | ✅ Verdict ON_TARGET; all numbers hand-checked (breakeven 325.21, safe 393.92, net 107.32 / 23.8%, max CPA 63.37 / 39.24, BE ROAS 2.54). The **cost chart rendered inline in the PRICE-3 card**; the link (356 chars) was copied intact and returned 200 |

## Planned layers (not built)

| Layer | Covers | Spec |
|---|---|---|
| S | `price_scenarios`: deterministic ladder, band thresholds, a price below breakeven is always `critical`, every row's margin agrees with `price_product`, revenue matches the stated volume, competitor labels and links survive, chart carries the table's numbers, no equation reaches the seller | `specs/beginner-pricing.md` §7 |
| D | `market_demand`: share-of-voice percentages sum to 100, each estimation branch incl. the `null` branch, cross-border warning, no multiplier in user-facing text | `specs/market-demand.md` §9 |

## Exit criteria for the build

- P, C, E, V and M are all green in `deno task test`.
- `deno lint` and `deno fmt --check` are clean.
- X1–X6 are done and recorded, with unverified items listed in the README.
