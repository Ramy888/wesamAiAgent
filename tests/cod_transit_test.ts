// Two gaps the simulated sessions exposed (docs/simulation-notes.md):
//   1. couriers charge to hand back the cash they collect;
//   2. orders still on their way are not returns.
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { checkCampaign, economics, priceProduct } from "../engine/canonical.ts";
import type { Campaign, Product } from "../engine/canonical.ts";

const P: Product = {
  productCost: 100,
  customsDutyPerUnit: 0,
  leadCpa: 15,
  confirmationRatePct: 60,
  deliveryRatePct: 50,
  deliveryFee: 25,
  returnShippingFee: 15,
  packagingCost: 0,
  fulfillmentFee: 0,
  callCenterCostPerLead: 0,
  smsCostPerLead: 0,
  platformFeePct: 0,
  paymentGatewayPct: 0,
  paymentGatewayFixed: 0,
  vatPct: 0,
  marketerCommissionPct: 0,
  targetMarginPct: 10,
  sellingPrice: 300,
  codFeePct: 0,
};

// ─── 1. COD collection fee ──────────────────────────────────────────────────

Deno.test("cod fee: charged on what the courier collects, like any revenue percentage", () => {
  const without = priceProduct(P).atSellingPrice!;
  const with2pct = priceProduct({ ...P, codFeePct: 2.5 }).atSellingPrice!;
  // 2.5% of the 300 collected.
  assertAlmostEquals(without.netProfit - with2pct.netProfit, 7.5, 1e-9);
});

Deno.test("cod fee: raises the breakeven and the safe price", () => {
  const base = economics(P);
  const withFee = economics({ ...P, codFeePct: 2.5 });
  assert(withFee.breakevenPrice! > base.breakevenPrice!, "breakeven rises");
  assert(withFee.suggestedPrice! > base.suggestedPrice!, "safe price rises");
  assertAlmostEquals(withFee.pctStack - base.pctStack, 0.025, 1e-12);
});

Deno.test("cod fee: defaults to zero, so existing answers do not move", () => {
  const { codFeePct: _drop, ...noField } = P;
  assertEquals(priceProduct(noField as Product), priceProduct({ ...P, codFeePct: 0 }));
});

Deno.test("cod fee: appears as its own line in a campaign's costs", () => {
  const campaign: Campaign = { adBudgetSpent: 1000, leads: 100, confirmed: 50, delivered: 40 };
  const r = checkCampaign({ ...P, codFeePct: 2.5 }, campaign);
  const row = r.costBreakdown.find((c) => c.key === "codFees")!;
  assert(row, "codFees is reported separately, not hidden in another line");
  assertAlmostEquals(row.amount, 40 * 300 * 0.025, 1e-9);
  const plain = checkCampaign(P, campaign);
  assertAlmostEquals(plain.netProfit - r.netProfit, 300, 1e-9);
});

// ─── 2. orders still in transit ─────────────────────────────────────────────

const WEEK: Campaign = { adBudgetSpent: 1000, leads: 100, confirmed: 50, delivered: 30 };

Deno.test("in transit: open orders are not counted as returns", () => {
  const withoutField = checkCampaign(P, WEEK);
  assertEquals(withoutField.rtoCount, 20, "unchanged when the seller doesn't say");

  const r = checkCampaign(P, { ...WEEK, inTransit: 15 });
  assertEquals(r.rtoCount, 5, "only the settled failures are returns");
  assertEquals(r.inTransit, 15);
  assert(r.warnings.some((w) => w.code === "ORDERS_IN_TRANSIT"));
});

Deno.test("in transit: the delivery rate is measured on settled orders only", () => {
  const r = checkCampaign(P, { ...WEEK, inTransit: 15 });
  // 30 delivered out of 35 that finished, not out of 50 confirmed.
  assertAlmostEquals(r.drPct!, (30 / 35) * 100, 1e-9);
  assertEquals(r.settledOrders, 35);
  const plain = checkCampaign(P, WEEK);
  assertAlmostEquals(plain.drPct!, 60, 1e-9, "unchanged when nothing is in transit");
});

Deno.test("in transit: a campaign is not condemned for orders that have not arrived yet", () => {
  const harsh = checkCampaign(P, WEEK);
  const fair = checkCampaign(P, { ...WEEK, inTransit: 15 });
  // The only difference is the return shipping wrongly charged on 15 open orders.
  assertAlmostEquals(fair.netProfit - harsh.netProfit, 15 * P.returnShippingFee, 1e-9);

  // On a tighter week that difference decides the verdict.
  const tight = { ...WEEK, adBudgetSpent: 5000 };
  assertEquals(checkCampaign(P, tight).verdict, "PAUSE", "open orders read as returns → loss");
  assertEquals(
    checkCampaign(P, { ...tight, inTransit: 15 }).verdict,
    "FIX",
    "counting only settled orders, the week is thin but not a loss",
  );
});

Deno.test("in transit: costs follow the settled orders", () => {
  const r = checkCampaign(P, { ...WEEK, inTransit: 15 });
  const shipping = r.costBreakdown.find((c) => c.key === "shippingCosts")!;
  // 30 delivered × 25, plus 5 genuine returns × 15. The 15 open orders cost nothing yet.
  assertAlmostEquals(shipping.amount, 30 * 25 + 5 * 15, 1e-9);
});

Deno.test("in transit: more open orders than confirmed is rejected, not silently clamped", () => {
  const r = checkCampaign(P, { ...WEEK, inTransit: 40 });
  assert(r.warnings.some((w) => w.code === "COUNTS_INCONSISTENT"), "30 + 40 > 50 confirmed");
});
