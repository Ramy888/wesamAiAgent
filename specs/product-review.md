# Spec: review a product from a link, and watch it over time

Status: **spec, 2026-09-23.** Part A (review from a link) needs no new code and is already in
the live instructions. Part B (watching a product) is **dropped**: Wesam sends nothing that
identifies the calling workspace, so per-seller state can't be kept safely (§4).

## 1. What was asked

> "Bya3 should review a current product from a link; check whether our current resources are
> enough or we need another tool or integration; plus a workflow that keeps reviewing a
> product on request, with competitor ads, traffic and sales. The seller should pick the task
> from the first message, and be able to turn the recurring check on, named something simple."

## 2. Are the current resources enough?

| Sub-task | What it needs | Status |
|---|---|---|
| Read a product page: title, price, offer, review count | Wesam browsing, or the Bright Data Unlocker zone | ✅ **have it** — the Unlocker zone already worked in the competitor tests |
| Find the same product elsewhere | The Bright Data SERP zone | ✅ have it |
| Price and position maths | `price_product`, `compare_prices` | ✅ **no new tool** |
| Competitor ads, traffic, sales | `market_demand` | ❌ **spec only** (`specs/market-demand.md`), and blocked on two decisions |
| Recurring per-seller watch | A watchlist store, two small tools, one scheduled workflow | ❌ **dropped** — no tenant identity (§4) |
| Real search volumes, ad hooks | A new integration (Google Ads, or an ad-library vendor) | ❌ see `market-demand.md` §4 |

**Answer: reviewing a product from a link needs no new tool and no new integration.** It's
instruction work on top of what's already live. Only the recurring watch needs code, and the
richer demand analysis needs the two decisions in `market-demand.md` §10.

## 3. Part A — review a product from a link (ship now)

A link tells you the **price**. It does not tell you the seller's **costs**. So this splits
into two flows with different questions.

### A1. "Review my own product"  (the seller's own store link)

1. Read the page: title, price, any offer ("2 for X"), review count, and the images.
2. Ask for the costs that a page can never show: product cost, shipping and returns, the fee
   percentages, confirmation and delivery rates, and the cost per lead.
3. Call `price_product` with the page's price as the seller's price.
4. Optionally `compare_prices` against what the same product sells for elsewhere.
5. Answer: verdict, profit at their price, the safe price, and one action.

### A2. "Should I sell this?"  (a competitor's or supplier's link)

The higher-value flow, and the one a seller asks before spending anything.

1. Read the page for the **market price** and any demand signals it shows.
2. Ask three things: what they think the landed cost will be, and their usual confirmation
   and delivery rates.
3. Call `compare_prices`: the market price becomes the competitor row.
4. Answer: whether any profitable price exists at that cost
   (`NO_PROFITABLE_PRICE` / `PRICE_IN_BAND` / `CANNOT_COMPETE_ON_PRICE`), the price they'd
   need, and what the margin would be.

### Hard rules for both

- **Currency conversion is arithmetic, so the model must not do it.** A supplier page in USD
  does not get multiplied by an exchange rate in the model's head. The seller types the
  landed cost in their own currency; they know their customs and freight better than any
  guessed rate. A `landed_cost` tool is a later version.
- The page's price is **an observation**: repeat it back and get a "yes" before using it, the
  same as with competitor prices today.
- If a page can't be read, say so plainly and ask the seller to paste the price. Never guess
  a price from the product name.
- Everything from `market-demand.md` applies to demand signals: confidence labels, source
  links, and never into the profit maths.

## 4. Part B — watching a product (dropped)

**What Wesam allows:** a workflow is defined in the builder and always runs on a schedule. An
end-user cannot create their own schedule from chat. So "watch this product" can't be a real
per-seller schedule; it has to be **one scheduled workflow that reads a watchlist**.

That needs somewhere to keep the list, which the server doesn't have: it's stateless by
design. Deno KV is the likely home.

**Both checks are now done (2026-09-23), and one of them failed:**

- ✅ **Deno KV is available** on the current Deploy platform (the docs list it as supported).
- ❌ **Wesam sends nothing that identifies the workspace.** Measured, not assumed: a temporary
  probe logged header *names only* on production, and a real `tools/call` from Bya3 arrived
  with just `accept, accept-encoding, connection, content-length, content-type, host,
  mcp-protocol-version, traceparent, tracestate, user-agent, via`. No authorization, no
  workspace or session id; `traceparent` changes per request. The probe was reverted and the
  clean build redeployed.

**Consequence: per-seller watching is not safely buildable today.** Every workspace that hires
Bya3 would share one anonymous stream of calls, so a watchlist would have no owner. Options if
this is ever revisited: ask the seller for an identifier and accept that they can see each
other's keys (bad), issue one token per workspace (defeats a single marketplace listing), or
wait for Wesam to forward a workspace id. **Decision: drop Part B; keep the stateless
fallback** — Bya3 offers to re-review any product whenever the seller asks.

<details><summary>Original plan, kept for reference</summary>

1. **Tenant identity — the blocker.** Once Bya3 is on the marketplace, every workspace that
   hires it shares one MCP server and one token. A watchlist with no owner would leak one
   seller's products into another's weekly report. So: does Wesam's proxy send anything that
   identifies the workspace or session? Find out by logging **header names only** (never
   values) on one request, then reverting. If nothing identifies the caller, **per-seller
   watching is not safely buildable** and this part is dropped.
2. **Is Deno KV available** on the current Deploy setup?

**If both pass**, the shape is:
- `watch_product(url, label, cadence)` → stores one row per seller, capped at 10 products.
- `list_watched()` / `unwatch_product(id)`.
- One weekly workflow: for each watched product, re-read the page, re-run the price check and
  the demand check, and report **only what changed** — a price move, a new competitor, a
  competitor who stopped advertising, a verdict that flipped. Silence when nothing changed.
- Quiet by design: at most one message per seller per week, and it says what changed, not
  everything it knows.

</details>

The fallback costs nothing and keeps most of the value: the seller asks Bya3 to re-review
whenever they want, and Bya3 says so at the end of a review. Stateless, no leak risk, no new
code — and it is already in the instructions.

## 5. The first-message menu

Bya3 opens with a short list, Arabic first, verbs not nouns. Six items maximum, so it reads as
a menu rather than a wall.

```
أقدر أساعدك في:
1. أسعّر منتج          2. أراجع حملة إعلانية
3. أجرّب عرض أو باكدج   4. أقارن سعري بالمنافسين
5. أراجع منتج من لينك   6. أقولك المنتج ده يستاهل تشتغل عليه ولا لأ
اكتب رقم، أو اكتب سؤالك على طول.
```

English mirror: price a product · review a campaign · test an offer · compare with
competitors · review a product from a link · tell me whether a product is worth selling.

Item 6 is flow A2. The watch option joins this list **only if Part B is built**.

### Naming the watch, for non-technical sellers

Avoid "workflow", "automation" and "schedule". Three candidates:

| Arabic | English | Feel |
|---|---|---|
| «خليك عيني عليه» | Keep an eye on it | warmest, most Egyptian |
| «متابعة أسبوعية» | Weekly check | plainest, says exactly when |
| «راقب المنتج» | Watch this product | neutral, closest to the button label |

Recommendation: «متابعة أسبوعية · Weekly check», because it tells the seller what they're
agreeing to. The seller turns it on by saying so; Bya3 confirms what it will send and when,
and how to stop it.

## 6. Priority

This is item 12 on the outstanding list. It doesn't move any of the three things judges score.
Part A is nearly free and makes the demo stronger, so it goes in now. Part B waits for the two
checks, and neither should displace finding the real seller (item 4).
