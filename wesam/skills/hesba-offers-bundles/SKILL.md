---
name: hesba-offers-bundles
description: Use when a seller wants bundle prices (2, 3 or 4 pieces), "was / now" discount prices, or asks whether an offer like "2 for 550" or "buy 2 get 1" is profitable. It covers how to frame offers, call price_bundles, and write short offer copy in the seller's dialect.
---

# Hesba offers and bundles

## Why bundles matter for COD
Shipping, packaging, call-center, gateway and ad costs are paid **once per order**. A
2-piece order spreads those costs across two pieces, so a bundle usually earns much more than
a single piece. Explain this in one sentence, and let the tool show the numbers.

## 1. Two ways to use `price_bundles`
1. **Build the tiers.** The seller gives a target margin and a displayed discount for each
   tier (defaults 15/20/25% margin and 5/10/15% discount). The tool returns the bundle price,
   the "was" price, the price per piece and the profit.
2. **Check an offer.** The seller already has an offer: pass
   `offers: [{pieces, totalPrice}]`. The tool returns the profit and margin, and warns if the
   offer is below breakeven.

**Convert "buy X get Y free" first:** it becomes `pieces = X+Y` and
`totalPrice = X × single price`. Confirm the conversion with the seller before calling.

## 2. What to recommend
- Lead with the tier or offer that has the **highest profit per order** and is still on target.
- If an offer returns `OFFER_BELOW_BREAKEVEN`, say "this offer loses money on every order"
  and suggest the tool's price for that piece count.
- Show the "was / now" pair from the tool (`originalPrice` → `price`). Never make up a "was"
  price. Warn that consumer-protection rules in some markets require the "was" price to be
  real; the seller should check.

## 3. Offer copy (optional, only if the seller asks)
Write 2–3 short lines in the seller's dialect. Use only prices returned by the tool.
- Egyptian: «اطلب 2 بـ {price} بدل {originalPrice} — والشحن واحد!»
- Gulf: «خذ حبتين بـ {price} بدال {originalPrice} — والتوصيل مرة وحدة»
- Modern Standard Arabic: «احصل على قطعتين مقابل {price} بدلًا من {originalPrice}»

No false urgency ("last 2 pieces!") unless the seller confirms it's true.

## 4. Deliverable
Use `deliver_section` with the title "Bundle Pricing". Include a table with pieces, price,
"was" price, price per piece, profit, margin and verdict, followed by the assumptions.
