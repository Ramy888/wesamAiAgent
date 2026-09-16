# Spec — Bya3 pricing agent (Wesam.ai) + pricing engine MCP server

Status: **draft v0.1**, 2026-09-16. Spec only. No engine code until G1 is answered (see §0).

## 0. Gate status

| Gate | Answer (2026-09-16) | Effect on this spec |
|---|---|---|
| G1: code before Oct 1? | **Unknown.** Check the rules or ask the organizers. | Until answered, September output is limited to specs, the test plan and outlines. |
| G2: reuse Bine code? | **Yes, port it.** | The engine is a port of `reference/dart/pricing_engine.dart`, checked against `reference/golden.json`. |
| G3: how Wesam calls tools | **MCP servers only.** Agent Builder → Tools → *Add MCP server*: name + **Streamable HTTP (https) URL**, include/exclude tool globs. "Wesam proxies it." "Every workspace signs in on its own, so no keys or passwords are stored here." "Publish, send and spend actions are always excluded." | **Replaces the REST API in CLAUDE.md §4 with an MCP server** (§2). |
| G4: can judges run it without an account? | **Partly answered.** Publishing needs a partner registration plus admin review, and an approved agent can then be hired by any Wesam workspace. There's no public chat link, so judges need a Wesam workspace. | The README must offer a Wesam-free path (§6). |

What the Wesam side needs (no code): instructions (markdown), up to 10 `.skill` files
(`SKILL.md`), up to 20 reference files, one MCP server URL, and optional workflows. The only
code in the project is the **pricing engine** plus a **thin MCP wrapper**, because the model
must never do the math itself.

## 1. Components

```
Seller ──chat (AR/EN)──▶ Wesam agent "Bya3"
                          (wesam/instructions.md + wesam/skills/pricing/SKILL.md)
                              │ MCP tools/call (Wesam proxies)
                              ▼
                  MCP server  POST /mcp/<token>  (Streamable HTTP, stateless, JSON responses)
                              │ pure function calls
                              ▼
                  engine/  (pure TS, no I/O)
                    parity.ts     5 Bine modes, same behaviour to 1e-4 → golden.json
                    canonical.ts  one full model used by every MCP tool
```

| Path | Contents |
|---|---|
| `engine/` | Pure functions: no HTTP, no clock, no randomness. |
| `server/` | MCP JSON-RPC handler, input validation, text rendering. |
| `wesam/` | `instructions.md` and `skills/pricing/SKILL.md` (with defaults and verdict templates), pasted or uploaded into Wesam. |
| `tests/` | See `specs/test-plan.md`. |

Runtime: Deno + TypeScript.

## 2. MCP server contract

### 2.1 Transport

- A single endpoint, `POST /mcp/<token>` (token: §2.2), using MCP **Streamable HTTP**. It responds with
  `Content-Type: application/json`; SSE is not needed because no tool streams.
- It is **stateless**:
  - It never requires `Mcp-Session-Id`; it may issue one but ignores it on later requests.
  - Wesam proxies the calls, so sticky sessions can't be assumed.
  - `GET /mcp/<token>` → 405. Bare `/mcp` or a wrong token → 404.
- Methods it must handle:
  - `initialize`
  - `notifications/initialized` (→ 202, no body)
  - `ping`
  - `tools/list`
  - `tools/call`
  - anything else → JSON-RPC `-32601`.
- The Wesam dialog's **Test** button must pass unauthenticated: it runs `initialize` + `tools/list`.
- `GET /health` → `{ "ok": true, "version": "<semver>", "engine": "<git sha>" }`.
- **Implementation choice is still open, decided by a spike on Oct 1 (or earlier if G1 allows):**
  - (a) `npm:@modelcontextprotocol/sdk`, only if it offers a web-standard `Request → Response`
    transport that runs under `Deno.serve`. Check the SDK README/exports for a
    fetch/WebStandard transport, or `@hono/mcp`.
  - (b) Hand-written JSON-RPC for the 5 methods above (~100 lines, no dependencies).
  - Pick (b) if (a) needs Node `req`/`res` shims.
- Hosting recommendation: **Deno Deploy**, which gives public HTTPS and a plain `fetch` handler.
  Avoid Supabase Edge Functions here: their default JWT check on `/functions/v1/*` would block
  the unauthenticated handshake. The user can override this.

### 2.2 Security posture (the endpoint is public and unauthenticated)

- It is a pure calculator: no storage, no outbound calls, no secrets, no user data kept.
  Logs hold method + tool name + latency only, never input values.
- **Access gate:** the URL path carries a secret, `/mcp/<token>`, since Wesam stores only a URL
  and no header.
  - A wrong token → 404.
  - This protects against casual abuse only; anyone who can see the agent config can see the token.
  - The judge/README path uses a separate token that can be rotated.
- Limits:
  - request body ≤ 32 KB
  - every number must be finite and within ±1e9
  - arrays ≤ 20 items
  - a tool call runs in O(1) time
- Rate limiting (best-effort only; on Deno Deploy it is in-memory per isolate): per token, not
  per IP, because all Wesam traffic arrives from Wesam's proxy. Soft limit: 60 calls/min per token.
- Tool annotations: `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

### 2.3 Tool naming

Wesam always excludes publish/send/spend actions, and its default exclude globs look like
`delete_*, admin_*`. So no tool name may contain `publish`, `send`, `spend`, `delete`, `admin`,
`pay` or `buy`. Input *fields* may use "adBudget", but tool names may not.

| Tool | Purpose | CLAUDE.md name |
|---|---|---|
| `price_product` | Suggested/breakeven price, profit **at the seller's price**, max CPA, BE ROAS, required CR | `/quote` |
| `cpa_table` | Max CPA per lead at margins +20 … −20% at the seller's price | `/cpa-matrix` |
| `price_bundles` | 2/3/4-piece bundle prices from margins, plus checks of explicit offers ("2 for 550") | `/bundles` |
| `check_campaign` | Real campaign P&L from actual counts, with a deterministic verdict | `/campaign-pnl` |

### 2.4 Shared input: `product` (used by all tools)

- Markets: Egypt, the 6 Gulf states, and the rest of MENA (19 countries; list in
  `wesam/skills/hesba-pricing-playbook/SKILL.md`). Money is in one `currency` per call
  (ISO 4217, default EGP). There is no FX conversion. The currency sets how text is rounded:
  3 decimals for KWD, BHD, OMR, JOD, TND and LYD; 0 for IQD; 2 for the rest.
  `structuredContent` always keeps 4 decimals.
- Percentages run 0–100. Unknown fields → error.
- Defaults are listed below. Every default the engine applies is reported in `assumptions[]`.

| Field | Type | Default | Validation |
|---|---|---|---|
| `productCost` | number | **required** | ≥ 0 |
| `customsDutyPerUnit` | number | 0 | ≥ 0 |
| `sellingPrice` | number | see §2.4.1 | > 0 |
| `leadCpa` | number | see §2.4.1 | ≥ 0 |
| `confirmationRatePct` | number | see §2.4.1 (the agent may propose 50–60 as a stated assumption) | 0 < x ≤ 100 |
| `deliveryRatePct` | number | see §2.4.1 (the agent may propose 45–80) | 0 < x ≤ 100 |
| `deliveryFee` | number | **required** | ≥ 0 |
| `returnShippingFee` | number | 0 | ≥ 0 |
| `packagingCost`, `fulfillmentFee` | number | 0 | ≥ 0 |
| `callCenterCostPerLead`, `smsCostPerLead` | number | 0 | ≥ 0 |
| `platformFeePct`, `paymentGatewayPct`, `vatPct`, `marketerCommissionPct` | number | **0** (not Bine's hidden tracker defaults; bug #2) | 0 ≤ x < 100 |
| `paymentGatewayFixed` | number | 0 | ≥ 0 |
| `targetMarginPct` | number | 20 (Bine's default) | −100 < x < 100 |
| `currency` | string | `"EGP"` | One of EGP, SAR, AED, KWD, QAR, BHD, OMR, JOD, ILS, LBP, USD, SYP, IQD, YER, MAD, DZD, TND, LYD, SDG, MRU |
| `market` | string | none | ISO 3166 alpha-2 (EG, SA, AE, …). Echo only, used for wording and assumptions; it never changes the math |
| `lang` | `"ar"` \| `"en"` \| `"fr"` | `"ar"` | Language of the `content` text only (`fr` for Maghreb sellers) |

#### 2.4.1 Required fields per tool

Each tool has its own input schema, and the validator is generated from that same schema
(test M5). "Ignored" means: accepted if supplied, not used, and not listed in `assumptions`.

| Field | `price_product` | `cpa_table` | `price_bundles` | `check_campaign` |
|---|---|---|---|---|
| `productCost`, `deliveryFee` | required | required | required | required |
| `sellingPrice` | optional | required | optional | required |
| `leadCpa` | required | optional (headline only) | required | ignored |
| `confirmationRatePct`, `deliveryRatePct` | required | required | required | ignored (the actual rates come from the counts) |
| `targetMarginPct` | default 20 | default 20 | default 20 | default 20 (the `FIX` verdict depends on it) |
| other fees | default 0 | default 0 | default 0 | default 0 |

CR = 0 and DR = 0 are rejected at the tool layer. In the Bine formulas they zero out
`leadsPerDelivered`, which silently drops ad cost from the price (see test plan, E1/E2). The
parity engine keeps that behaviour; the tools refuse it with the error "No order can ever be
delivered at CR/DR = 0".

### 2.5 Shared output envelope

```jsonc
{
  "content": [{ "type": "text", "text": "<short summary in lang, money 2 dp, pct 1 dp>" }],
  "structuredContent": {
    "tool": "price_product",
    "engineVersion": "0.1.0",
    "inputsUsed": { /* every field, after defaults */ },
    "assumptions": [ { "field": "vatPct", "value": 0, "reason": "default" } ],
    "warnings":    [ { "code": "PRICE_BELOW_BREAKEVEN", "message": "..." } ],
    "result":      { /* tool-specific, numbers rounded to 4 dp */ }
  },
  "isError": false
}
```

- **Validation failure:**
  - `isError: true`, and the text lists every bad field with its reason (in `lang`).
  - `structuredContent.errors[] = {field, code, message}`.
  - This is never a JSON-RPC error; those are reserved for protocol faults.
- **Undefined values** (for example, a suggested price when stack + margin ≥ 100%) are `null` plus a
  warning. They are never `0`, `NaN` or `Infinity`. JSON must never contain non-finite numbers.
- **Warning codes:**

  | Code | When |
  |---|---|
  | `STACK_PLUS_MARGIN_GE_100` | Percentage stack + target margin ≥ 100% |
  | `STACK_GE_100` | Percentage stack alone ≥ 100% |
  | `PRICE_BELOW_BREAKEVEN` | Seller's price is below breakeven |
  | `CPA_ABOVE_MAX` | Lead CPA is above the maximum |
  | `REQUIRED_CR_UNREACHABLE` | Required CR > 100 |
  | `NEGATIVE_TARGET_MARGIN` | Target margin is negative |
  | `COUNTS_INCONSISTENT` | Delivered > confirmed, or confirmed > leads |
  | `NO_DELIVERIES` | No delivered orders |
  | `NO_AD_BUDGET` | Ad budget is 0 |
  | `OFFER_BELOW_BREAKEVEN` | An explicit bundle offer loses money |

### 2.6 Canonical model (all tools)

This is Bine's Ultimate model (CLAUDE.md §5), extended to evaluate **at the seller's price
`p`**. That fixes bugs #1 and #4, and uses one percentage stack everywhere (bug #3).

```
sr = cr*dr ; L = 1/sr
blended   = deliveryFee*dr + returnShippingFee*(1-dr)
unit      = productCost + customsDutyPerUnit
ops       = packagingCost + fulfillmentFee                  (per delivered; see open bug #8)
leadProc  = L*(callCenterCostPerLead + smsCostPerLead)
fixedNL   = unit + blended + ops + paymentGatewayFixed      (fixed costs excluding lead processing)
fixed     = fixedNL + leadProc
stack     = (vat + platform + marketer + gateway%)/100 ; tm = targetMargin/100
ad        = leadCpa*L
breakevenPrice = stack<1     ? (fixed+ad)/(1-stack)    : null
suggestedPrice = stack+tm<1  ? (fixed+ad)/(1-stack-tm) : null
at p:  gross(p)   = p*(1-stack) - fixed          (contribution before ads, per delivered order)
       net(p)     = gross(p) - ad
       margin(p)  = net(p)/p*100
       maxCpa(p,m)= (p*(1-stack-m) - fixed) * sr (per lead; m=0 → breakeven, m=tm → target)
       beRoas(p)  = gross(p)>0 ? p/gross(p) : null
       requiredCr(p) = (leadCpa + cc + sms) / ((p*(1-stack-tm) - fixedNL) * dr) * 100
                       (null if the denominator ≤ 0; warning if > 100)
```

`requiredCr` is solved exactly. It accounts for lead processing, which also scales with 1/CR,
unlike Bine's simple `requiredCr`.

### 2.7 Tool specs

**`price_product`**
- Input: `product` (with `sellingPrice` optional).
- `result`:
  - always: `successRatePct`, `leadsPerDelivered`, `costBreakdown[]` (per delivered order),
    `suggestedPrice`, `breakevenPrice`, `atSuggested { grossProfit, netProfit, netMarginPct, maxCpa, breakEvenRoas }`
  - if `sellingPrice` is given: `atSellingPrice { grossProfit, netProfit, netMarginPct, maxCpaBreakeven, maxCpaAtTarget, breakEvenRoas, requiredCrPct }`
    and `verdict`.
- `verdict` rules (checked in this order):

  | Verdict | Condition |
  |---|---|
  | `LOSS` | `net(p) < 0` |
  | `BELOW_TARGET` | `margin(p) < targetMargin` |
  | `ON_TARGET` | otherwise |

  The verdict code also carries `raiseTo = suggestedPrice` when the price is below target.

`costBreakdown` labels:
- Product cost
- Blended shipping
- Operations
- Lead processing
- Gateway fixed
- Revenue % stack (at `p` if given, else at the suggested price)
- Ad cost per delivered

**`cpa_table`**
- Input: `product` (with `sellingPrice` required), plus optional `margins` (default
  `[20,15,10,5,0,-5,-10,-20]`).
- `result.rows[] = { marginPct, maxCpaPerLead, viable }`, where `viable = maxCpaPerLead > 0 && marginPct >= 0`.
  Negative-margin rows are shown but flagged as losing money. This fixes an extra bug (§5, #9).
- `result.headline = { maxCpaBreakeven, maxCpaAtTarget, currentLeadCpa?, verdict }`, all at `p`.

**`price_bundles`**
- Input: `product`, plus:
  - `tiers` (default `[{pieces:2,marginPct:15,discountPct:5},{3,20,10},{4,25,15}]`)
  - optional `offers: [{pieces, totalPrice}]`
- For each tier:
  - `bundleFixed = n*unit + blended + ops + gatewayFixed + leadProc`
  - `price = (bundleFixed+ad)/(1-stack-m)` (null if that denominator ≤ 0)
  - `originalPrice = price/(1-d)`
  - `profit = price*(1-stack) - bundleFixed - ad`
  - `marginPct`, `pricePerPiece`, `savingVsSingles` (only if `sellingPrice` is given): `n*p - price`.
- For each offer: `profit = totalPrice*(1-stack) - bundleFixed - ad`, `marginPct`, `verdict`.

**`check_campaign`**
- Input: `product` (required fields per §2.4.1; `targetMarginPct` drives the verdict), plus
  `campaign { adBudgetSpent, leads, confirmed, delivered, periodName? }`, all counts ≥ 0.
  The field is named `adBudgetSpent` because the tool name must avoid "spend"; the field name is
  free.
- Formulas: Bine's P&L Tracker, with these changes:

  | Output | Formula |
  |---|---|
  | `contributionBeforeAds` | `revenue - totalCosts` (bug #6: replaces Bine's `grossProfit`) |
  | `maxCplBreakeven` | `contributionBeforeAds / leads` |
  | `maxCplAtTarget` | `(revenue*(1-tm) - totalCosts) / leads` |
  | `requiredPrice` | `(nonPctCosts + adBudgetSpent) / (delivered*(1-stack-tm))` |
  | `breakevenPrice` | `(nonPctCosts + adBudgetSpent) / (delivered*(1-stack))` |
  | actual rates | `crPct = confirmed/leads`, `drPct = delivered/confirmed` (the input CR/DR are ignored) |

- `verdict`:

  | Verdict | Condition |
  |---|---|
  | `PAUSE` | `netProfit < 0` |
  | `FIX` | `netMarginPct < targetMargin` |
  | `SCALE` | otherwise |

  Plus a `levers[]` list, ranked by the gap it closes:
  - `cpl` vs `maxCplAtTarget`
  - price vs `requiredPrice`
  - actual CR/DR vs the rates needed at the current CPL

## 3. Agent behaviour (Wesam: `wesam/instructions.md` + `SKILL.md`)

- **Persona:** Bya3 (بيّاع), a pricing and ad-profit analyst for Egyptian COD sellers.
  - Default language: Egyptian Arabic. It switches to English if the seller writes in English,
    and passes `lang` to the tools.
- **Flow:**
  1. Work out the goal: price a product, check a campaign, or bundles/offers. If the goal is
     unclear, offer these three options.
  2. Collect the required inputs, **at most 3 questions per message**. Optional fees: ask once,
     as a group ("any VAT, platform, marketer or gateway fees?"). A "no" means 0.
  3. For unknown CR/DR, propose 55% / 60% as **stated assumptions** and ask the seller to confirm.
     Never pick them silently.
  4. Call the tool. Never compute or estimate a number itself, including "roughly" or mental
     math. Every number shown must come from `structuredContent`.
  5. Reply in this order:
     - **verdict first** (one line)
     - 3–5 key numbers
     - **one** concrete action
     - the assumptions used (from `assumptions[]`), briefly
- **Guardrails:**
  - If the tool returns `isError`, relay the field problems and re-ask.
  - If the tool is unreachable: "The calculator isn't responding right now" (no numbers).
  - Money is in EGP unless the seller says otherwise.
  - Don't give tax or legal advice beyond the entered percentages.
- **Example target** (Ultimate defaults, entered price 300, lead CPA 15; the numbers come from the
  tool, see test plan C1):
  > "سعرك 300 تقريبًا على التعادل: صافي ربح 2.19 ج.م للأوردر (0.7%). أقصى CPA تقدر تدفعه 15.59
  > وإنت بتدفع 15. عشان توصل لهامش 10% ارفع السعر لـ 345.23."
  >
  > English: "Your price of 300 is roughly breakeven: net profit is 2.19 EGP per order (0.7%). The
  > most you can pay per lead is 15.59, and you're paying 15. To reach a 10% margin, raise the
  > price to 345.23."
- **SKILL.md holds:**
  - the required inputs for each tool
  - Egyptian default ranges
  - the verdict → action templates (AR/EN)
  - a glossary (CR, DR, RTO, CPA, ROAS) in both languages
- **Workflows (stretch):** "Weekly campaign check" asks for the week's numbers → `check_campaign`
  → verdict.

## 4. Non-goals (v1)

- FX conversion: no remote FX source covers EGP or the Gulf currencies (see `specs/tools.md`)
- Saving products or merchants
- Reading ad-platform APIs
- CSV/Sheets import (stretch goal only)
- Showing Bine's simple-formula modes through the tools (they exist only in `engine/parity.ts`
  for golden tests)

## 5. Bug handling (CLAUDE.md §6 + new findings)

**Order of work:** port for parity (`parity.ts` passes `golden.json`) → build `canonical.ts`
with its own hand-computed tests. Canonical tools never call parity functions, so golden entries
stay unchanged. Each canonical change that differs from Bine is a separate commit whose test
cites the bug number.

| # | Bug | Resolution in canonical |
|---|---|---|
| 1 | Ultimate ignores `sellingPrice` | `atSellingPrice` block |
| 2 | Hidden tracker fee defaults | All fees default to 0 and are reported in `assumptions` |
| 3 | Modes use different formulas | One model |
| 4 | CPA headline vs table | Both at `p` |
| 5 | Reverse bundles use `deliveryFee` | Bundles use `blended` |
| 6 | Tracker `grossProfit` | `contributionBeforeAds` |
| 7 | No tests | This project has them |
| **8 (new, needs your decision)** | The quote model counts packaging, fulfillment and gateway-fixed **per delivered** order. The tracker counts them **per confirmed** order, and Advanced P&L uses `fulfillment/dr`. For COD, every shipped order incurs these costs, so the quote under-costs by a factor of `1/dr`. | Proposed: `ops/dr` and `gatewayFixed/dr` in canonical. **Not applied** until confirmed; the C-tests in the test plan use the Bine (per-delivered) form. |
| **9 (new)** | CPA Matrix marks negative-margin rows (−5…−20%) "viable" | Canonical marks them not viable |
| **10 (new)** | Parity `requiredCr` ignores lead-processing costs | Canonical solves it exactly (§2.6) |
| **11 (new)** | Bine returns `0` for undefined results (suggested price at stack + margin ≥ 1; BE ROAS at gross ≤ 0), which reads as a real number | Canonical returns `null` + a warning |

## 6. Judge path (< 5 minutes, works without Wesam)

1. `deno task test`: all golden + canonical tests pass.
2. `deno task serve` → `http://localhost:8000/mcp/dev` (`dev` = the local token).
3. Either:
   - `npx @modelcontextprotocol/inspector` → connect → call `price_product` with
     `examples/ultimate.json`, or
   - a one-line `curl` JSON-RPC `tools/call` (provided in the README).
4. The hosted URL + the Wesam agent link (depends on G4).

The same server also works in Claude Desktop and Claude Code as a fallback demo.

## 7. Open items

| Item | Owner | Blocks |
|---|---|---|
| G1: is pre-Oct-1 code allowed? | user (rules) | Any engine code |
| G4: judge access / marketplace | user (check *Publish to marketplace*) | README + demo |
| Does Wesam accept an MCP server with **no** OAuth? (dialog says "every workspace signs in"; the Test button will tell) | spike | Auth design |
| SDK transport on Deno vs hand-written JSON-RPC | spike | server/ |
| Bug #8 decision (ops/gateway per shipped order) | user | Canonical expected values |
| Does Wesam's proxy forward `structuredContent`, or only `content` text? | spike | How much goes into the text |
