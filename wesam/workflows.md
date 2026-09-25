# Afandina workflows (Wesam Agent Builder → Workflows)

Each workflow in Wesam has these parts:
- a name
- a description
- input fields (the questions asked when the workflow starts)
- ordered steps, each with a deliverable
- a schedule (always required; see below)

All numbers come from the Hesba calculator tools. Steps say which tool to call.

> **What Wesam allows (checked in the builder on 2026-09-16):**
> - A seller starts a workflow from the chat goal menu, and the workflow then keeps running on
>   its schedule ("Endless", or ending on a date). **A schedule is always required.** It is set
>   by a preset or a cron expression plus a timezone, and a new workflow defaults to
>   *every day at 9:00 UTC*. There is no "run once / manual only" setting.
> - Each workflow also has:
>   - input fields (number, select, multiselect, text or boolean)
>   - steps, each with a deliverable type ("Pricing Strategy", "Ad Report",
>     "Advice Brief", "Document", …)
>   - a goal with key results
>   - rules and guardrails
>   - a live agent prompt with a "scope lock"
> - "Build it with AI from the description" drafts all of these.
>
> **Decision:**
> - Only **#2 Weekly campaign check** becomes a Wesam workflow:
>   - cron `0 10 * * 0`, timezone Africa/Cairo, endless
>   - deliverable type "Ad Report"
> - **#1, #3 and #4 stay on-demand.** They are handled by the instructions and skills in a
>   normal chat ("simple task"), because a forced recurring run with no new input would only
>   waste tokens.
> - Create #2 only after the Hesba calculator MCP is connected. Otherwise every scheduled
>   run would just report "calculator unavailable".
>
> **Created 2026-09-17** ("Weekly campaign check · مراجعة الحملات الأسبوعية", enabled).
> - Cron `0 10 * * 0`, Africa/Cairo, endless; the goal starts as active.
> - 4 input fields:
>   - products (text)
>   - country/currency (select, 14 options)
>   - unit costs (text)
>   - target margin % (number, default 20, min 0)
> - 5 steps; deliverable types Document / – / Ad Report / Advice Brief / –.
> - The rules forbid paid lookups (Bright Data) in this workflow.
> - Built by hand: Wesam's "Build it with AI" failed with "Couldn't build: Expecting value:
>   line 1 column 1".

---

## 1. Price a new product · تسعير منتج جديد
**Description:** Before launching ads, work out the safe selling price, the breakeven price,
the max CPA and bundle prices for one product, in the seller's market and currency.
**Schedule:** on demand.

**Input fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Product name | text | yes | |
| Country / currency | select (19 markets, see the pricing playbook) | yes | |
| Product cost per unit (+ customs) | number | yes | |
| Delivery fee / return shipping fee | number | yes / no (default 0) | |
| Expected lead CPA | number | yes | |
| Confirmation rate % / delivery rate % | number | yes | Egypt: suggest 55 / 60 as an assumption |
| Planned selling price | number | no | |
| Target margin % | number | no (default 20) | |
| Other fees (packaging, fulfillment, call center, SMS, VAT, platform, marketer, gateway) | long text | no | "none" means all 0 |

**Steps:**
1. Confirm the inputs back to the seller in one short table.
2. Call `price_product`. Deliverable: **Product Pricing** (verdict, suggested and breakeven
   price, profit at the planned price, max CPA, breakeven ROAS, assumptions).
3. If there is a planned price, call `cpa_table`. Deliverable: **CPA Table** (the 8 margin rows
   with the viable ones marked).
4. Call `price_bundles` with the default tiers. Deliverable: **Bundle Pricing**.
5. Close with one recommended launch price, a CPA ceiling for the media buyer, and the best
   bundle.

---

## 2. Weekly campaign check · مراجعة الحملات الأسبوعية
**Description:** Every week, review each active product's ads against real confirmed and
delivered orders, and give a SCALE / FIX / PAUSE verdict with the one action that matters most.
**Schedule:** weekly, **Sunday 10:00 (Africa/Cairo)**. Adjust per market; the Gulf work week
also starts on Sunday.

**Input fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Products / campaigns to review | long text | yes | one per line |
| Period | date range | yes | default: the last 7 days |
| Country / currency | select | yes | |
| For each product: price, cost, delivery fee, return fee, other fees | long text or saved from memory | yes | |
| Ads data | file upload or screenshot (Ads Manager / TikTok / Snap export) | yes | or typed numbers |
| Orders data: confirmed and delivered (courier export or sheet) | file upload or typed | yes | |
| Target margin % | number | no (default 20) | |

**Steps:**
1. Extract the budget spent, leads, confirmed and delivered orders for each product (see the
   campaign-review skill). Show them in a table and ask the seller to confirm.
2. Call `check_campaign` once per product.
3. Deliverable: **Campaign Check**, one section per product (verdict, key numbers, the #1
   lever, assumptions).
4. Summary: which to pause, which to fix (and how), and which to scale, with each stop-loss
   CPL.
5. If last week's Campaign Check exists (artifact_search), list the verdict changes.

---

## 3. Bundle & offer builder · باني العروض والباكدجات
**Description:** Design profitable 2/3/4-piece bundles or check a planned offer ("2 for 550",
"buy 2 get 1"), with optional offer copy in the seller's dialect.
**Schedule:** on demand.

**Input fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Product + country / currency | text / select | yes | |
| Unit cost, delivery fee, return fee, CPA, CR %, DR % | number | yes | |
| Current single-piece price | number | yes | |
| Offers to check | long text | no | e.g. "2 for 550; buy 2 get 1" |
| Target margins / displayed discounts per tier | text | no | defaults 15/20/25 and 5/10/15 |
| Want ad copy? | yes / no | no | |

**Steps:**
1. Convert "buy X get Y" offers into pieces and a total price, and confirm them with the seller.
2. Call `price_bundles` with the tiers and offers. Deliverable: **Bundle Pricing**.
3. Recommend the offer with the best profit per order that is still on target, and flag any
   loss-making offers.
4. If the seller asked for copy, write 2–3 lines per offer in their dialect, using only the
   tool's prices.

---

## 4. (stretch) Price-increase test plan · خطة تجربة رفع السعر
**Description:** For a product that is `BELOW_TARGET`, plan a safe price test.
**Schedule:** on demand.

**Steps:**
1. Call `price_product` at the current price.
2. Call it again at the suggested price.
3. Deliverable: a test plan with the two prices, their max CPA, and the confirmation rate
   needed at each (`requiredCrPct`).
4. Suggest re-running the weekly check after 7 days.
