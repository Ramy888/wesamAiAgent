---
name: hesba-competitor-check
description: Use when a seller asks what competitors charge, whether their price is competitive, or how to position their price in a market. Covers finding competitor offers with the Bright Data integration (SERP Search, Web Unlocker), building a confirmed evidence table, and calling the compare_prices tool.
---

# Hesba competitor check

The seller should only have to name the **product**, the **country** and their **price**. You
find the competitors; the seller confirms what you found; `compare_prices` does the math.

## 1. Inputs
- Product name as customers search for it, in Arabic and English if possible (for example
  "جهاز مساج الرقبة / neck massager").
- Country / currency (see the pricing playbook).
- The seller's price.
- The pricing inputs `compare_prices` needs: cost, delivery fee, CPA, CR, DR, optional fees.
  Reuse them if the seller already gave them in this chat.

## 2. Find competitor offers (Bright Data), with a budget of 12 Bright Data calls per request
1. **SERP Search**: at most 3 searches, in the seller's country and language. Examples:
   - `<product> سعر`
   - `<product> الدفع عند الاستلام`
   - `<product> price <country>`
   Prefer shopping results, store pages and landing pages (EasyOrders, YouCan, Shopify, Salla,
   Zid, Noon, Amazon, Jumia). Skip blogs, videos and news.
2. Pick **up to 8 distinct sellers** that clearly sell the **same product**.
3. **Web Unlocker**: open each page once and read:
   - the price the customer pays now (ignore crossed-out "was" prices)
   - the pieces in the offer
   - any shipping charged on top ("free shipping" means 0)
   - the store name
   If a page has several offers (1 piece / 2 pieces), record each one as a separate row.
4. If a price is unclear or the page doesn't load, drop that row. **Never guess a price.**

## 3. Confirm with the seller (always, before calling the tool)
Show one short table:

| # | Store | Price | Pieces | Shipping | Link |

Then ask one question: "دي أسعار المنافسين اللي لقيتها، أستخدمها؟" (English: "These are the
competitor prices I found. Should I use them?"). Remove or fix any row the seller corrects.

## 4. Compare
Call `compare_prices`. For each row pass:
- `label`, `totalPrice`, `pieces`, `shippingCharged`
- `source` (the link)
- `seenOn` (today, YYYY-MM-DD)

## 5. Answer (verdict first)

| Recommendation | What to tell the seller |
|---|---|
| `PRICE_IN_BAND` | "Price between {low} and {high}." Mention the seller's `position`. |
| `PREMIUM_ONLY` | "Don't race to the bottom. Price at {low} or above, and justify it (quality, warranty, faster delivery)." |
| `CANNOT_COMPETE_ON_PRICE` | "Competitors are cheaper than your safe price." Offer a bundle (`price_bundles`), or say the product cost has to come down. |
| `NO_PROFITABLE_PRICE` | "The fees leave no profitable price." Review the fees. |

Then add:
- 2–3 competitor rows from `ifMatched`, for example "If you match A at 279, you lose 12.83
  per order".
- The `FEW_COMPETITORS` warning, if present.
- The sources: "prices seen today on …".

## 6. If Bright Data fails
If you get a zone error, an auth error or no results, say so plainly: "I couldn't search
competitors automatically right now." Then offer two options:
- the seller pastes 3–5 competitor links or screenshots
- you retry later

Don't invent competitor prices.

## Rules
- Only public pages. No logins, no personal data, no bulk crawling.
- Every Bright Data call costs the workspace credits, so stay within the budget above.
- Store competitor data only in this chat or its deliverable (`deliver_section` with the title
  "Competitor Check").
