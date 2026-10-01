// Canonical layer (test plan §C and §E). Expected values come from the independent
// Python oracle in tests/oracle/oracle.py, not from this engine.
// Bug #8 (ops/gateway per shipped order) is NOT applied: ops costs are per delivered order,
// matching the original app's Ultimate model. If that decision changes, these values must be recomputed.
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import golden from "../reference/golden.json" with { type: "json" };
import {
  type Campaign,
  checkCampaign,
  cpaTable,
  DEFAULT_TIERS,
  priceBundles,
  priceProduct,
  type Product,
} from "../engine/canonical.ts";

const TOL = 1e-4;
const EXACT = 1e-9;

const g = golden.ultimatePricing.input;
/** Fixture U: the golden Ultimate input, with the seller's price of 300. */
const U: Product = {
  productCost: g.productCost,
  customsDutyPerUnit: g.customsDutyPerUnit,
  leadCpa: g.leadCpa,
  confirmationRatePct: g.confirmationRatePct,
  deliveryRatePct: g.deliveryRatePct,
  deliveryFee: g.deliveryFee,
  returnShippingFee: g.returnShippingFee,
  packagingCost: g.packagingCost,
  fulfillmentFee: g.fulfillmentFee,
  callCenterCostPerLead: g.callCenterCostPerLead,
  smsCostPerLead: g.smsCostPerLead,
  platformFeePct: g.platformFeePct,
  paymentGatewayPct: g.paymentGatewayPct,
  paymentGatewayFixed: g.paymentGatewayFixed,
  vatPct: g.vatPct,
  marketerCommissionPct: g.marketerCommissionPct,
  targetMarginPct: g.targetMarginPct,
  sellingPrice: 300,
};

const t = golden.plTracker.input;
/** Fixture T: the golden tracker input (tracker CR/DR are ignored by check_campaign). */
const T: Product = {
  ...U,
  productCost: t.productCost,
  customsDutyPerUnit: t.customsDutyPerUnit,
  deliveryFee: t.deliveryFee,
  returnShippingFee: t.returnShippingFee,
  packagingCost: t.packagingCost,
  fulfillmentFee: t.fulfillmentFee,
  callCenterCostPerLead: t.callCenterCostPerLead,
  smsCostPerLead: t.smsCostPerLead,
  platformFeePct: t.platformFeePct,
  paymentGatewayPct: t.paymentGatewayPct,
  paymentGatewayFixed: t.paymentGatewayFixed,
  vatPct: t.vatPct,
  marketerCommissionPct: t.marketerCommissionPct,
  targetMarginPct: 20,
  sellingPrice: t.sellingPrice,
};
const TC: Campaign = {
  adBudgetSpent: t.adSpend,
  leads: t.totalLeads,
  confirmed: t.confirmedOrders,
  delivered: t.deliveredOrders,
};

const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

function assertNum(actual: number | null | undefined, expected: number, tol = TOL, msg?: string) {
  assert(typeof actual === "number", `${msg ?? "value"} should be a number, got ${actual}`);
  assertAlmostEquals(actual, expected, tol, msg);
}

// ─── price_product ──────────────────────────────────────────────────────────

Deno.test("C1: suggested and breakeven prices equal the original app's Ultimate model", () => {
  const r = priceProduct(U);
  assertNum(r.suggestedPrice, 345.2273);
  assertNum(r.breakevenPrice, 296.9438);
});

Deno.test("C2–C7: metrics at the seller's price", () => {
  const s = priceProduct(U).atSellingPrice!;
  assertNum(s.grossProfit, 57.7407, TOL, "grossProfit");
  assertNum(s.netProfit, 2.1852, TOL, "netProfit");
  assertNum(s.netMarginPct, 0.7284, TOL, "netMarginPct");
  assertNum(s.maxCpaBreakeven, 15.59, TOL, "maxCpaBreakeven");
  assertNum(s.maxCpaAtTarget, 7.49, TOL, "maxCpaAtTarget");
  assertNum(s.breakEvenRoas, 5.1956, TOL, "breakEvenRoas");
  assertNum(s.requiredCrPct, 105.1051, TOL, "requiredCrPct");
});

Deno.test("C7/C8: unreachable CR is warned; verdict is BELOW_TARGET with raiseTo", () => {
  const r = priceProduct(U);
  assert(codes(r.warnings).includes("REQUIRED_CR_UNREACHABLE"));
  assertEquals(r.verdict?.code, "BELOW_TARGET");
  assertNum(r.verdict?.raiseTo, 345.2273);
});

Deno.test("price_product: at-suggested block reproduces the original app's Ultimate headline", () => {
  const a = priceProduct(U).atSuggested!;
  assertNum(a.netProfit, 34.5227);
  assertNum(a.netMarginPct, 10);
  assertNum(a.maxCpaBreakeven, 24.3211);
  assertNum(a.breakEvenRoas, 3.8325);
});

Deno.test("price_product: without a selling price there is no verdict or at-price block", () => {
  const r = priceProduct({ ...U, sellingPrice: undefined });
  assertEquals(r.atSellingPrice, null);
  assertEquals(r.verdict, null);
  assertNum(r.suggestedPrice, 345.2273);
});

Deno.test("price_product: cost breakdown matches the original app's Ultimate breakdown at the suggested price", () => {
  const r = priceProduct({ ...U, sellingPrice: undefined });
  const golden7 = golden.ultimatePricing.output.cogsBreakdown.map((c) => c.amount);
  assertEquals(r.costBreakdown.length, 7);
  r.costBreakdown.forEach((c, i) => assertNum(c.amount, golden7[i], TOL, c.key));
});

Deno.test("price_product: verdicts LOSS and ON_TARGET", () => {
  const loss = priceProduct({ ...U, sellingPrice: 250 });
  assertEquals(loss.verdict?.code, "LOSS");
  assert(codes(loss.warnings).includes("PRICE_BELOW_BREAKEVEN"));
  assert(codes(loss.warnings).includes("CPA_ABOVE_MAX"));
  const ok = priceProduct({ ...U, sellingPrice: 360 });
  assertEquals(ok.verdict?.code, "ON_TARGET");
  assertEquals(ok.verdict?.raiseTo, null);
});

// ─── cpa_table ──────────────────────────────────────────────────────────────

Deno.test("C9: CPA table rows and viability", () => {
  const rows = cpaTable(U).rows;
  const expected = [-0.61, 3.44, 7.49, 11.54, 15.59, 19.64, 23.69, 31.79];
  const viable = [false, true, true, true, true, false, false, false];
  assertEquals(rows.map((r) => r.marginPct), [20, 15, 10, 5, 0, -5, -10, -20]);
  rows.forEach((r, i) => {
    assertNum(r.maxCpaPerLead, expected[i], TOL, `row ${r.marginPct}`);
    assertEquals(r.viable, viable[i], `viable ${r.marginPct}`);
  });
});

Deno.test("cpa_table: headline is at the seller's price (bug #4 fixed)", () => {
  const h = cpaTable(U).headline;
  assertNum(h.maxCpaBreakeven, cpaTable(U).rows[4].maxCpaPerLead, EXACT);
  assertNum(h.maxCpaAtTarget, 7.49);
  assertEquals(h.currentLeadCpa, 15);
  assertEquals(h.verdict, "BELOW_TARGET");
});

// ─── price_bundles ──────────────────────────────────────────────────────────

Deno.test("C10: default tiers equal the original app's Ultimate bundles", () => {
  const r = priceBundles(U, DEFAULT_TIERS, []);
  const gold = golden.ultimatePricing.output.bundles;
  assertEquals(r.tiers.length, 3);
  r.tiers.forEach((b, i) => {
    assertNum(b.price, gold[i].totalPrice, TOL, "price");
    assertNum(b.originalPrice, gold[i].originalTotalPrice, TOL, "originalPrice");
    assertNum(b.pricePerPiece, gold[i].pricePerPiece, TOL, "pricePerPiece");
    assertNum(b.profit, gold[i].profitPerBundle, TOL, "profit");
    assertNum(b.marginPct, gold[i].marginPct, TOL, "marginPct");
  });
  assertNum(r.tiers[0].savingVsSingles, 600 - 570.4687, TOL, "savingVsSingles");
});

Deno.test("C11: explicit offers", () => {
  const r = priceBundles(U, [], [{ pieces: 2, totalPrice: 550 }, { pieces: 3, totalPrice: 780 }]);
  assertNum(r.offers[0].profit, 70.9352);
  assertNum(r.offers[0].marginPct, 12.8973);
  assertEquals(r.offers[0].verdict, "ON_TARGET");
  assertNum(r.offers[1].profit, 125.3852);
  assertNum(r.offers[1].marginPct, 16.075);
});

Deno.test("E9: an offer below breakeven is flagged", () => {
  const r = priceBundles(U, [], [{ pieces: 2, totalPrice: 300 }]);
  assert(r.offers[0].profit < 0);
  assertEquals(r.offers[0].verdict, "LOSS");
  assert(codes(r.warnings).includes("OFFER_BELOW_BREAKEVEN"));
});

// ─── check_campaign ─────────────────────────────────────────────────────────

Deno.test("C12: campaign P&L on the golden tracker input", () => {
  const r = checkCampaign(T, TC);
  assertNum(r.revenue, 12000);
  assertNum(r.totalCosts, 10440);
  assertNum(r.contributionBeforeAds, 1560);
  assertNum(r.netProfit, 560);
  assertNum(r.netMarginPct, 4.6667);
  assertNum(r.cpl, 10);
  assertNum(r.maxCplBreakeven, 15.6);
  assertNum(r.maxCplAtTarget, -8.4);
  assertNum(r.requiredPrice, 401.0989);
  assertNum(r.breakevenPrice, 278.626);
  assertNum(r.actualCpaPerDelivered, 25);
  assertNum(r.roas, 12);
  assertNum(r.breakEvenRoas, 7.6923);
  assertNum(r.crPct, 50);
  assertNum(r.drPct, 80);
  assertEquals(r.rtoCount, 10);
  assertEquals(r.verdict, "FIX");
});

Deno.test("C12: campaign totals equal the original app's tracker totals (bridge to parity)", () => {
  const r = checkCampaign(T, TC);
  const gold = golden.plTracker.output.cogsBreakdown.map((c) => c.amount);
  const sum = r.costBreakdown.reduce((a, c) => a + c.amount, 0);
  assertNum(sum, golden.plTracker.output.totalCogs, TOL);
  assertNum(r.costBreakdown.reduce((a, c) => a + c.amount, 0), gold.reduce((a, b) => a + b, 0));
});

Deno.test("check_campaign: levers put the feasible fix first", () => {
  const r = checkCampaign(T, TC);
  assertEquals(r.levers[0].lever, "price");
  assertEquals(r.levers[0].feasible, true);
  const cpl = r.levers.find((l) => l.lever === "cpl")!;
  assertEquals(cpl.feasible, false);
});

Deno.test("check_campaign: SCALE and PAUSE verdicts", () => {
  assertEquals(checkCampaign({ ...T, sellingPrice: 450 }, TC).verdict, "SCALE");
  assertEquals(checkCampaign(T, { ...TC, adBudgetSpent: 5000 }).verdict, "PAUSE");
});

// ─── identities (exact) ─────────────────────────────────────────────────────

Deno.test("C13/C14: net at breakeven is 0; margin at suggested equals target", () => {
  const r = priceProduct(U);
  const atBe = priceProduct({ ...U, sellingPrice: r.breakevenPrice! }).atSellingPrice!;
  assertNum(atBe.netProfit, 0, EXACT);
  const atSug = priceProduct({ ...U, sellingPrice: r.suggestedPrice! }).atSellingPrice!;
  assertNum(atSug.netMarginPct, U.targetMarginPct, EXACT);
});

Deno.test("C15: campaign net at its breakeven price is 0; margin at required price is target", () => {
  const r = checkCampaign(T, TC);
  assertNum(checkCampaign({ ...T, sellingPrice: r.breakevenPrice! }, TC).netProfit, 0, EXACT);
  assertNum(
    checkCampaign({ ...T, sellingPrice: r.requiredPrice! }, TC).netMarginPct,
    T.targetMarginPct,
    EXACT,
  );
});

Deno.test("C16: max CPA at breakeven equals lead CPA exactly when net profit is 0", () => {
  const be = priceProduct(U).breakevenPrice!;
  const s = priceProduct({ ...U, sellingPrice: be }).atSellingPrice!;
  assertNum(s.maxCpaBreakeven, U.leadCpa, EXACT);
});

Deno.test("C17: monotonicity over random valid inputs", () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) {
    const p: Product = {
      ...U,
      productCost: 10 + rnd() * 500,
      leadCpa: rnd() * 60,
      confirmationRatePct: 5 + rnd() * 95,
      deliveryRatePct: 5 + rnd() * 95,
      vatPct: rnd() * 20,
      platformFeePct: rnd() * 20,
      sellingPrice: 50 + rnd() * 1500,
    };
    const net = (q: Product) => priceProduct(q).atSellingPrice!.netProfit;
    assert(net({ ...p, productCost: p.productCost + 1 }) <= net(p) + EXACT, "cost ↑ ⇒ net ↓");
    assert(net({ ...p, sellingPrice: p.sellingPrice! + 1 }) >= net(p) - EXACT, "price ↑ ⇒ net ↑");
  }
});

// ─── edge cases (test plan §E) ──────────────────────────────────────────────

Deno.test("E1/E2: CR or DR of 0 is rejected by the engine", () => {
  for (const zero of [{ confirmationRatePct: 0 }, { deliveryRatePct: 0 }]) {
    let threw = false;
    try {
      priceProduct({ ...U, ...zero });
    } catch (e) {
      threw = e instanceof RangeError;
    }
    assert(threw, `expected RangeError for ${JSON.stringify(zero)}`);
  }
});

Deno.test("E3: stack + margin = 100% → suggested null, breakeven finite", () => {
  const p = {
    ...U,
    vatPct: 80,
    platformFeePct: 0,
    marketerCommissionPct: 0,
    paymentGatewayPct: 0,
    targetMarginPct: 20,
  };
  const r = priceProduct(p);
  assertEquals(r.suggestedPrice, null);
  assertEquals(r.atSuggested, null);
  assert(Number.isFinite(r.breakevenPrice!));
  assert(codes(r.warnings).includes("STACK_PLUS_MARGIN_GE_100"));
  assertEquals(r.verdict?.raiseTo, null);
});

Deno.test("E4: stack ≥ 100% → both prices null, verdict LOSS", () => {
  const r = priceProduct({ ...U, vatPct: 95, platformFeePct: 10 });
  assertEquals(r.breakevenPrice, null);
  assertEquals(r.suggestedPrice, null);
  assert(codes(r.warnings).includes("STACK_GE_100"));
  assertEquals(r.verdict?.code, "LOSS");
  assertEquals(r.atSellingPrice?.breakEvenRoas, null);
});

Deno.test("E5: negative target margin is allowed and warned", () => {
  const r = priceProduct({ ...U, targetMarginPct: -10 });
  assert(Number.isFinite(r.suggestedPrice!));
  assert(r.suggestedPrice! < r.breakevenPrice!);
  assert(codes(r.warnings).includes("NEGATIVE_TARGET_MARGIN"));
});

Deno.test("E6: empty campaign → ratios null, verdict null", () => {
  const r = checkCampaign(T, { adBudgetSpent: 0, leads: 0, confirmed: 0, delivered: 0 });
  assertEquals(r.revenue, 0);
  for (
    const k of [
      "netMarginPct",
      "cpl",
      "roas",
      "breakEvenRoas",
      "crPct",
      "drPct",
      "requiredPrice",
    ] as const
  ) {
    assertEquals(r[k], null, k);
  }
  assertEquals(r.verdict, null);
  assert(codes(r.warnings).includes("NO_DELIVERIES"));
  assert(codes(r.warnings).includes("NO_AD_BUDGET"));
});

Deno.test("E7: delivered > confirmed → RTO clamped and warned", () => {
  const r = checkCampaign(T, { ...TC, delivered: 60 });
  assertEquals(r.rtoCount, 0);
  assert(codes(r.warnings).includes("COUNTS_INCONSISTENT"));
});

Deno.test("E8: budget spent with no deliveries → PAUSE, CPA null", () => {
  const r = checkCampaign(T, { adBudgetSpent: 500, leads: 20, confirmed: 5, delivered: 0 });
  assertEquals(r.verdict, "PAUSE");
  assertEquals(r.actualCpaPerDelivered, null);
  assert(r.netProfit < 0);
});

Deno.test("E10: huge values stay finite", () => {
  const r = priceProduct({ ...U, productCost: 1e9, sellingPrice: 1e9, leadCpa: 1e9 });
  assert(Number.isFinite(r.suggestedPrice!));
  assert(Number.isFinite(r.atSellingPrice!.netProfit));
});

/** Walks the live object, before JSON.stringify can turn NaN into null. */
function assertNoNonFinite(value: unknown, path = "$"): void {
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${path} is ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoNonFinite(v, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoNonFinite(v, `${path}.${k}`);
  }
}

Deno.test("E11: no NaN or Infinity anywhere, across edge inputs", () => {
  const products: Product[] = [
    U,
    { ...U, sellingPrice: undefined },
    { ...U, vatPct: 95, platformFeePct: 10 },
    {
      ...U,
      vatPct: 80,
      platformFeePct: 0,
      marketerCommissionPct: 0,
      paymentGatewayPct: 0,
      targetMarginPct: 20,
    },
    { ...U, targetMarginPct: -99 },
    { ...U, productCost: 0, deliveryFee: 0, leadCpa: 0 },
    { ...U, confirmationRatePct: 0.001, deliveryRatePct: 0.001 },
  ];
  for (const p of products) {
    assertNoNonFinite(priceProduct(p));
    assertNoNonFinite(priceBundles(p, DEFAULT_TIERS, [{ pieces: 2, totalPrice: 0.01 }]));
    if (p.sellingPrice) assertNoNonFinite(cpaTable(p));
  }
  const campaigns: Campaign[] = [
    TC,
    { adBudgetSpent: 0, leads: 0, confirmed: 0, delivered: 0 },
    { adBudgetSpent: 100, leads: 0, confirmed: 3, delivered: 5 },
  ];
  for (const c of campaigns) {
    assertNoNonFinite(checkCampaign(T, c));
    assertNoNonFinite(checkCampaign({ ...T, vatPct: 95, platformFeePct: 10 }, c));
  }
});
