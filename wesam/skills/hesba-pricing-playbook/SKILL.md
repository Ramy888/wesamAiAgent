---
name: hesba-pricing-playbook
description: Use whenever a seller wants to price a product, work out a safe or breakeven price, the max CPA, or a CPA table, in any Egypt/MENA/Gulf market. It covers which inputs to collect for each Hesba calculator tool, how to handle currency and market, suggested defaults, and how to phrase the answer.
---

# Hesba pricing playbook

Every number comes from the **Hesba calculator** tools (`price_product`, `cpa_table`,
`price_bundles`, `check_campaign`). Never compute, estimate or round a number yourself. If a
tool is unavailable, say so and stop. Don't approximate.

## 1. Market and currency (ask once, at the start)
- Ask which country the seller sells in, unless it is obvious from the conversation.
- Always pass the currency code. All money in one call must be in the same currency.
- If the seller mixes currencies (for example, they buy in USD and sell in SAR), ask them to
  convert to one currency. **Do not convert yourself.**

| Market | Currency | Decimals | Dialect to use |
|---|---|---|---|
| Egypt | EGP | 2 | Egyptian |
| Saudi Arabia | SAR | 2 | Gulf / Saudi |
| UAE | AED | 2 | Gulf |
| Kuwait | KWD | 3 | Gulf |
| Qatar | QAR | 2 | Gulf |
| Bahrain | BHD | 3 | Gulf |
| Oman | OMR | 3 | Gulf |
| Jordan | JOD | 3 | Levantine |
| Palestine | ILS or JOD (ask) | 2 / 3 | Levantine |
| Lebanon | LBP or USD (ask) | 2 | Levantine |
| Syria | SYP | 2 | Levantine |
| Iraq | IQD | 0 in practice | Iraqi |
| Yemen | YER | 2 | Simple Modern Standard Arabic |
| Morocco | MAD | 2 | Simple Modern Standard Arabic (switch to French if the seller does) |
| Algeria | DZD | 2 | Simple Modern Standard Arabic (switch to French if the seller does) |
| Tunisia | TND | 3 | Simple Modern Standard Arabic (switch to French if the seller does) |
| Libya | LYD | 3 | Simple Modern Standard Arabic |
| Sudan | SDG | 2 | Simple Modern Standard Arabic |
| Mauritania | MRU | 2 | Simple Modern Standard Arabic |

Show amounts with the market's decimals, exactly as the tool returns them.

## 2. Required inputs for each tool

**All tools:**
- product cost (plus customs or import cost per unit, if any)
- delivery fee
- return shipping fee (0 if none)

**`price_product`:**
- lead CPA (ad cost per lead)
- confirmation rate %
- delivery rate %
- optional: selling price, which unlocks profit *at the seller's price*
- target margin % (default 20)

**`cpa_table`:** the same inputs as `price_product`, plus the selling price (**required**).

**`price_bundles`:** the same inputs as `price_product`. Optional:
- tiers: pieces, margin % and discount % for each
- offers such as "2 for 550"

**`check_campaign`:**
- selling price
- ad budget spent
- leads, confirmed orders and delivered orders
- target margin %

It does not need CR, DR or CPA; it reads them from the counts.

**Optional costs (ask once, as a group, for every tool):**
- packaging and fulfillment, per order
- call center and SMS, per lead
- VAT %, platform %, marketer commission %
- payment gateway %, plus the fixed gateway fee

"None" means 0.

## 3. Suggested defaults (always say they are assumptions and get a yes)
- **Egypt COD:** CR ≈ 55%, DR ≈ 60% if the seller doesn't know them.
- **Other markets:** no built-in rates. Ask the seller for last month's numbers. If they
  don't have them, use `cpa_table` so they can see a range instead of guessing.
- **VAT:** never assume a rate. Ask: "Do you charge VAT? At what %?" If the seller isn't sure,
  tell them to check with their accountant and run the calculation with and without VAT.

## 4. Asking well
- Ask at most 3 questions per message.
- Accept rough numbers ("about 100") and repeat them back.
- If a number looks off (a delivery rate above 100%, a CPA higher than the price), ask again
  instead of calling the tool.

## 5. Answer format
1. **Verdict** in one line: `LOSS` / `BELOW_TARGET` / `ON_TARGET` (for campaigns:
   `PAUSE` / `FIX` / `SCALE`).
2. **3–5 numbers**: price, profit per order, margin, max CPA vs current CPA, breakeven ROAS.
3. **One action.** Map each verdict to its action:

   | Verdict | Action |
   |---|---|
   | `LOSS` | Raise the price to `suggestedPrice`, or cut the CPA below `maxCpaBreakeven`. |
   | `BELOW_TARGET` | Raise the price to `suggestedPrice`. If the market won't accept that, offer a bundle (see the offers skill). |
   | `ON_TARGET` | Keep the price. The CPA ceiling is `maxCpaAtTarget`; share it with the media buyer. |
   | `REQUIRED_CR_UNREACHABLE` warning | "At this price, no confirmation rate can reach your target. Change the price or the CPA." |

4. **Assumptions**: list the tool's `assumptions[]` in one line.

## 6. Glossary (explain on first use, in the seller's language)

| Term | Arabic | Meaning |
|---|---|---|
| CR | نسبة التأكيد | Share of leads that confirm |
| DR | نسبة التسليم | Share of confirmed orders that are delivered and paid |
| RTO | المرتجع | A returned order; you pay return shipping |
| CPA | تكلفة الليد | Ad cost per lead |
| ROAS | العائد على الإعلان | Revenue ÷ ad budget |
| Breakeven | التعادل | No profit, no loss |
