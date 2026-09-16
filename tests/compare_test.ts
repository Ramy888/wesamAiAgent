// compare_prices (specs/competitor-pricing.md). Expected values from tests/oracle/oracle.py.
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { comparePrices, type Competitor, type Product } from "../engine/canonical.ts";

const TOL = 1e-4;

/** Fixture U (golden Ultimate input): breakeven 296.9438, suggested 345.2273. */
const U: Product = {
  productCost: 100,
  customsDutyPerUnit: 10,
  leadCpa: 15,
  confirmationRatePct: 60,
  deliveryRatePct: 45,
  deliveryFee: 25,
  returnShippingFee: 15,
  packagingCost: 5,
  fulfillmentFee: 10,
  callCenterCostPerLead: 2,
  smsCostPerLead: 0.5,
  platformFeePct: 8,
  paymentGatewayPct: 2.5,
  paymentGatewayFixed: 3,
  vatPct: 15,
  marketerCommissionPct: 3,
  targetMarginPct: 10,
  sellingPrice: 300,
};

const C = (label: string, totalPrice: number, pieces = 1, shippingCharged = 0): Competitor => ({
  label,
  totalPrice,
  pieces,
  shippingCharged,
});

const MARKET = [C("A", 279), C("B", 299, 1, 30), C("C", 349), C("D", 550, 2), C("E", 399)];

Deno.test("compare: per-piece prices include shipping the customer pays", () => {
  const r = comparePrices(U, MARKET);
  assertEquals(r.competitors.map((c) => c.pricePerPiece), [279, 329, 349, 275, 399]);
});

Deno.test("compare: market stats (linear percentiles)", () => {
  const s = comparePrices(U, MARKET).market;
  assertEquals([s.count, s.min, s.p25, s.median, s.p75, s.max], [5, 275, 279, 329, 349, 399]);
});

Deno.test("compare: profit if the seller matched each offer", () => {
  const r = comparePrices(U, MARKET).competitors;
  const expected = [
    [-12.8298, -4.5985, "LOSS", 11.536],
    [22.9202, 6.9666, "BELOW_TARGET", 21.1885],
    [37.2202, 10.6648, "ON_TARGET", 25.0495],
    [70.9352, 12.8973, "ON_TARGET", 34.1525],
    [72.9702, 18.2883, "ON_TARGET", 34.702],
  ] as const;
  r.forEach((c, i) => {
    const [profit, margin, verdict, maxCpa] = expected[i];
    assertAlmostEquals(c.ifMatched.profit, profit, TOL, `${c.label} profit`);
    assertAlmostEquals(c.ifMatched.marginPct, margin, TOL, `${c.label} margin`);
    assertEquals(c.ifMatched.verdict, verdict, `${c.label} verdict`);
    assertAlmostEquals(c.ifMatched.maxCpaBreakeven, maxCpa, TOL, `${c.label} max CPA`);
  });
});

Deno.test("compare: suggested above the median → PREMIUM_ONLY band [suggested, max]", () => {
  const r = comparePrices(U, MARKET);
  assertEquals(r.recommendation.code, "PREMIUM_ONLY");
  assertAlmostEquals(r.recommendation.low!, 345.2273, TOL);
  assertEquals(r.recommendation.high, 399);
  assertAlmostEquals(r.breakevenPrice!, 296.9438, TOL);
  assertEquals(r.seller?.position, "BELOW_BAND");
  assertAlmostEquals(r.seller!.shareCheaperPct, 40, TOL);
});

Deno.test("compare: PRICE_IN_BAND when suggested ≤ median", () => {
  const r = comparePrices({ ...U, sellingPrice: 365 }, [
    C("a", 350),
    C("b", 360),
    C("c", 380),
    C("d", 400),
  ]);
  assertEquals(r.recommendation.code, "PRICE_IN_BAND");
  assertAlmostEquals(r.recommendation.low!, 357.5, TOL);
  assertEquals(r.recommendation.high, 370);
  assertEquals(r.seller?.position, "IN_BAND");
});

Deno.test("compare: CANNOT_COMPETE_ON_PRICE when suggested is above every competitor", () => {
  const r = comparePrices(U, [C("a", 250), C("b", 260), C("c", 300)]);
  assertEquals(r.recommendation.code, "CANNOT_COMPETE_ON_PRICE");
  assertEquals(r.recommendation.low, null);
  assertEquals(r.recommendation.high, null);
  assertEquals(r.seller?.position, null);
  assertAlmostEquals(r.seller!.shareCheaperPct, 66.6667, TOL); // 250 and 260 are below 300
});

Deno.test("compare: NO_PROFITABLE_PRICE when fees plus margin reach 100%", () => {
  const r = comparePrices({
    ...U,
    vatPct: 80,
    platformFeePct: 0,
    marketerCommissionPct: 0,
    paymentGatewayPct: 0,
    targetMarginPct: 20,
  }, MARKET);
  assertEquals(r.recommendation.code, "NO_PROFITABLE_PRICE");
  assert(r.warnings.some((w) => w.code === "STACK_PLUS_MARGIN_GE_100"));
});

Deno.test("compare: fewer than 3 competitors is warned; no selling price → no seller block", () => {
  const r = comparePrices({ ...U, sellingPrice: undefined }, [C("a", 400)]);
  assert(r.warnings.some((w) => w.code === "FEW_COMPETITORS"));
  assertEquals(r.seller, null);
  assertEquals(r.market.median, 400);
});

Deno.test("compare: ABOVE_BAND when the seller is above the recommended band", () => {
  const r = comparePrices({ ...U, sellingPrice: 420 }, MARKET);
  assertEquals(r.seller?.position, "ABOVE_BAND");
});
