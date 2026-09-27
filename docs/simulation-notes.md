# Simulated seller sessions — what they are, and what they taught us

Date: 2026-09-25. Two AI models (ChatGPT and Gemini) were asked to role-play the seller session in
`docs/seller-intake.md`, one for Egypt and Iraq.

## Read this first

**Nothing here is a measurement, and none of it may appear on the impact slides.** One of the two
runs invented specific figures — minutes per task, money saved, a seller quote — that read exactly
like findings from a real session. They are not. The other run said so itself and framed its output
as interview rehearsal.

Use these notes for two things only: as a rehearsal script for the real session, and as the backlog
of model gaps below.

## What the simulations got right about the domain

Both runs, independently, raised the same three things a real COD seller would hit. Two are now
fixed; one is deferred.

### 1. Cash-on-delivery collection fees — **fixed 2026-09-27**

Couriers charge to hand the collected cash back: a percentage of what they collect, or a flat fee
above a threshold. Our model had no place for it, so every profit figure was slightly optimistic for
sellers who pay it.

Evidence beyond the simulation: Bosta charges 1% of the amount above 3,000 EGP; Quiqup publishes
"2.5% of the value collected for all cash and card payments" (`reference/market-defaults.json`).

Now a `codFeePct` input, charged on the amount collected, in every tool.

### 2. Orders still in transit — **fixed 2026-09-27**

A seller checking a campaign on Sunday may have orders confirmed but not yet delivered or returned.
Our campaign check treated _every_ confirmed-but-not-delivered order as a return, which understates
the delivery rate and can turn a healthy campaign into a PAUSE verdict.

Both simulations flagged it in the seller's own voice: _"الطلبات الجديدة اللي بعدها بالطريق ما أريد
تنحسب كأنها فشلت"_ — orders still on their way should not count as failures.

Now an optional `inTransit` count: those orders are excluded from the settled population, the
delivery rate is measured on what has settled, and the answer says how many are still open.

### 3. Three kinds of return cost different amounts — **deferred**

Cancelled before shipping (no courier cost, packaging may be reusable), refused at the door (full
return shipping, packaging usually lost), and returned after delivery (return shipping plus possible
restocking). We model one blended return fee.

Deferred because splitting it changes the core model and needs a real seller's courier invoices to
calibrate. Ask for those in the session.

## Bug #8 — still not decided

Both simulations said packaging is consumed the moment the box leaves the warehouse, whether or not
the order is delivered, and that fulfilment depends on the warehouse agreement. Bosta's terms point
the same way: fees are charged for shipments "تم تسليمها أو إرجاعها" (delivered **or** returned).

That is consistent enough to have a hypothesis — packaging and fulfilment accrue per **shipped**
order, not per delivered one — but two language models agreeing is not evidence about a real
business. The session asks the question directly; its answer decides the bug.

## Rehearsal value

Questions the simulations showed a seller will ask back, worth being ready for:

- Does the supplier price already include customs? (Do not count it twice.)
- What exactly counts as a "lead" — a message, a phone number, or a complete order?
- Is the platform fee charged on the product price or on the total including shipping?
- Is the marketer's commission on sales, on collected sales, on profit, or on ad spend?
- Is the target margin on the selling price, or a markup on cost?
- Are the seller's prices and costs inclusive or exclusive of VAT?

Several of these are currently single inputs in our tools with an assumed basis. If a real seller
answers differently, the assumption line must say which basis was used.
