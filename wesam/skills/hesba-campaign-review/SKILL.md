---
name: hesba-campaign-review
description: Ad campaign check from real numbers: PAUSE/FIX/SCALE
---

# Hesba campaign review

Goal: turn the seller's real campaign data into a **SCALE / FIX / PAUSE** verdict with the one
change that matters most. All math is done by `check_campaign`. You only read numbers from the
seller's data and never calculate them.

## 1. The four numbers you need, for the same period and the same product
| Number | Where sellers find it |
|---|---|
| Ad budget spent | Meta Ads Manager: "Amount spent" · TikTok: "Cost" · Snapchat: "Spend" · Google Ads: "Cost" |
| Leads | Meta: "Results" or "Leads" (check that the result type really is leads/orders) · TikTok/Snap: "Conversions" · or the order count in their store or sheet |
| Confirmed orders | Call-center sheet, or store status "Confirmed" |
| Delivered orders | Courier report (Bosta, Aramex, J&T, SMSA, etc.): "Delivered" / "تم التسليم", paid orders only |

Also collect:
- selling price
- product cost
- delivery fee and return shipping fee
- other fees (see the pricing playbook)
- target margin

## 2. Reading screenshots and files
- Read only the numbers you can clearly see. Repeat them back in a short table and ask
  "صح كده؟" (is this right?) **before** calling the tool.
- If the date ranges differ between the ads data and the courier data, point it out and ask
  the seller to align them. Delivered orders often lag a few days behind the ad spend.
- Remove currency symbols and thousands separators. Keep the currency code.
- If a column is ambiguous (for example, "Results" could mean messages rather than orders),
  ask. Never assume.

## 3. Sanity checks before calling the tool
Ask again if any of these is true:
- delivered > confirmed
- confirmed > leads
- ad budget = 0 while there are paid leads

The tool will also warn you, but asking first saves a round trip.

## 4. After the tool responds
- **PAUSE** (`netProfit < 0`): "Stop this ad set today." Name the biggest lever from
  `levers[]`.
- **FIX** (profitable but below target): name the #1 lever:
  - CPL above `maxCplAtTarget`: tighten targeting or the creative, or lower bids
  - price below `requiredPrice`: raise the price, or push a bundle
  - low CR: fix the call-center script and call faster
  - low DR: confirm the address and send a WhatsApp reminder before shipping
- **SCALE**: "Raise the budget gradually and re-check in 3–4 days." Give `maxCplAtTarget` as
  the stop-loss.

## 5. Weekly review format (for deliver_section "Campaign Check")
```
Campaign · period · currency
Verdict: SCALE / FIX / PAUSE
| Budget spent | Leads | Confirmed | Delivered | Revenue | Net profit | Margin |
| CPL vs max CPL at target | Actual CR / DR |
The #1 action this week:
Assumptions:
```
Compare with the previous week's review only when it exists (use artifact_search). Report
only the differences the tool returned; don't compute deltas yourself.
