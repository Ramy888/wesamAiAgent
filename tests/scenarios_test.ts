// price_scenarios: one table a beginner can read — every price, what it earns, and how healthy
// it is, with competitors in the same rows. Spec: specs/beginner-pricing.md.
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { priceProduct, priceScenarios } from "../engine/canonical.ts";
import type { Product } from "../engine/canonical.ts";

const P: Product = {
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

const COMPS = [
  { label: "Store A", price: 279 },
  { label: "Store B", price: 380, source: "https://example.test/b" },
];

Deno.test("scenarios: the ladder is deterministic, sorted, de-duplicated and bounded", () => {
  const a = priceScenarios(P, COMPS);
  const b = priceScenarios(P, COMPS);
  assertEquals(a, b, "same inputs, same table");

  const prices = a.rows.map((r) => r.price);
  assertEquals([...prices].sort((x, y) => x - y), prices, "sorted ascending");
  assertEquals(new Set(prices).size, prices.length, "no duplicate prices");
  assert(prices.length <= 12, `at most 12 rows, got ${prices.length}`);

  // The anchors a seller needs are all present.
  const r = priceProduct(P);
  for (const anchor of [r.breakevenPrice!, r.suggestedPrice!, 300, 279, 380]) {
    assert(
      prices.some((p) => Math.abs(p - anchor) < 1e-4),
      `ladder includes ${anchor}`,
    );
  }
});

Deno.test("scenarios: each row is tagged with who it belongs to, and keeps its source", () => {
  const rows = priceScenarios(P, COMPS).rows;
  const you = rows.find((x) => x.kind === "you")!;
  assertEquals(you.price, 300);
  const a = rows.find((x) => x.who === "Store A")!;
  assertEquals(a.kind, "competitor");
  assertEquals(a.price, 279);
  const b = rows.find((x) => x.who === "Store B")!;
  assertEquals(b.source, "https://example.test/b");
  assert(rows.some((x) => x.kind === "suggested"), "the safe price is marked");
  assert(rows.some((x) => x.kind === "breakeven"), "breakeven is marked");
});

Deno.test("scenarios: margins agree with price_product at the same price", () => {
  const res = priceScenarios(P, COMPS);
  for (const row of res.rows) {
    const one = priceProduct({ ...P, sellingPrice: row.price }).atSellingPrice!;
    assertAlmostEquals(row.profitPerOrder, one.netProfit, 1e-9, `profit at ${row.price}`);
    assertAlmostEquals(row.marginPct, one.netMarginPct, 1e-9, `margin at ${row.price}`);
  }
});

Deno.test("scenarios: bands are monotonic, and a price below breakeven is never profitable", () => {
  const res = priceScenarios(P, COMPS);
  const rank = { LOSS: 0, CRITICAL: 1, THIN: 2, HEALTHY: 3 };
  let last = -1;
  for (const row of res.rows) {
    const r = rank[row.band];
    assert(r >= last, `bands never get worse as the price rises (at ${row.price})`);
    last = r;
    if (row.price < res.breakevenPrice! - 1e-9) {
      assertEquals(row.band, "LOSS", `below breakeven at ${row.price}`);
      assert(row.profitPerOrder < 0);
    }
    // A price the pricing tool calls "below target" must never be sold as healthy.
    const verdict = priceProduct({ ...P, sellingPrice: row.price }).verdict!.code;
    if (verdict !== "ON_TARGET") assert(row.band !== "HEALTHY", `${row.price} is not healthy`);
    if (row.band === "HEALTHY") assertEquals(verdict, "ON_TARGET");
  }
});

Deno.test("scenarios: band thresholds at their exact boundaries", () => {
  // Margin exactly 0 is critical, not a loss; below 5% is critical; at target it is healthy.
  const rows = priceScenarios({ ...P, targetMarginPct: 10 }, COMPS).rows;
  for (const row of rows) {
    if (row.profitPerOrder < -1e-9) assertEquals(row.band, "LOSS");
    else if (row.marginPct < 5) assertEquals(row.band, "CRITICAL");
    // The target boundary uses the same tolerance as priceVerdict: 10.000000000 counts as met.
    else if (row.marginPct < 10 - 1e-9) assertEquals(row.band, "THIN");
    else assertEquals(row.band, "HEALTHY");
  }
  // A target below the critical line can never produce a healthy row.
  const low = priceScenarios({ ...P, targetMarginPct: 2 }, COMPS).rows;
  for (const row of low) {
    if (row.marginPct < 5) assert(row.band !== "HEALTHY", "a 4% margin is never healthy");
  }
});

Deno.test("scenarios: the breakeven row is not reported as a loss", () => {
  const res = priceScenarios(P, COMPS);
  const row = res.rows.find((r) => r.kind === "breakeven")!;
  assertAlmostEquals(row.price, res.breakevenPrice!, 1e-9);
  assertAlmostEquals(row.profitPerOrder, 0, 1e-6);
  assertEquals(row.band, "CRITICAL", "breaking even is thin, not a loss");
});

Deno.test("scenarios: revenue and profit follow the stated ad spend", () => {
  const res = priceScenarios(P, COMPS, 1000);
  assertEquals(res.adSpendAssumed, 1000);
  const e = priceProduct(P).economics;
  const delivered = 1000 / e.adCostPerDelivered;
  for (const row of res.rows) {
    assertAlmostEquals(row.deliveredOrders!, delivered, 1e-9);
    assertAlmostEquals(row.revenue!, row.price * delivered, 1e-6, `revenue at ${row.price}`);
    assertAlmostEquals(row.profit!, row.profitPerOrder * delivered, 1e-6);
  }
  // Doubling the spend doubles the volume columns but never the per-order ones.
  const twice = priceScenarios(P, COMPS, 2000);
  assertAlmostEquals(twice.rows[0].revenue!, res.rows[0].revenue! * 2, 1e-6);
  assertEquals(twice.rows[0].profitPerOrder, res.rows[0].profitPerOrder);
});

Deno.test("scenarios: with no ad cost the volume columns are null, not infinity", () => {
  const res = priceScenarios({ ...P, leadCpa: 0 }, COMPS);
  assert(res.warnings.some((w) => w.code === "VOLUME_UNDEFINED"));
  for (const row of res.rows) {
    assertEquals(row.deliveredOrders, null);
    assertEquals(row.revenue, null);
    assertEquals(row.profit, null);
    assert(Number.isFinite(row.profitPerOrder), "per-order numbers still work");
  }
});

Deno.test("scenarios: works with no competitors, and with no seller price", () => {
  const solo = priceScenarios(P, []);
  assert(solo.rows.length >= 3, "breakeven, suggested and the ladder still make a table");
  assert(!solo.rows.some((r) => r.kind === "competitor"));

  const { sellingPrice: _drop, ...noPrice } = P;
  const res = priceScenarios(noPrice as Product, COMPS);
  assert(!res.rows.some((r) => r.kind === "you"), "nothing is marked as the seller's price");
  assert(res.rows.some((r) => r.kind === "competitor"));
});

Deno.test("scenarios: an impossible cost stack yields no table instead of nonsense", () => {
  const res = priceScenarios({ ...P, vatPct: 90, platformFeePct: 20 }, COMPS);
  assert(res.warnings.some((w) => w.code === "STACK_GE_100"));
  assertEquals(res.breakevenPrice, null);
  assertEquals(res.suggestedPrice, null);
  // Competitor prices can still be shown; they are simply all losses.
  for (const row of res.rows) assertEquals(row.band, "LOSS");
});

// ─── server side: chart, text and the market cost table ─────────────────────

import { createHandler } from "../server/mcp.ts";
import { verifyChart } from "../server/charts.ts";
import { MARKET_COSTS } from "../server/market-defaults.ts";

const SECRET = "test-chart-secret";
const handler = createHandler({
  tokens: ["t0k"],
  chartSecret: SECRET,
  publicBaseUrl: "https://calc.example",
  rateLimitPerMinute: 10_000,
});

let rpcId = 1;
async function call(name: string, args: Record<string, unknown>) {
  const res = await handler(
    new Request("http://x/mcp/t0k", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  return (await res.json()).result;
}

const ARGS = { ...P, competitors: [{ label: "Store A", price: 279 }] };

Deno.test("price_scenarios chart carries exactly the rows in the result", async () => {
  const r = await call("price_scenarios", ARGS);
  const sc = r.structuredContent;
  const ref = sc.charts[0];
  assertEquals(ref.key, "scenarios");
  const token = ref.url.match(/\/chart\/scenarios\/([^/]+)\.svg$/)![1];
  const data = verifyChart("scenarios", token, SECRET) as { rows: [number, string, string][] };
  assertEquals(
    data.rows.map((row) => [row[0], row[2]]),
    sc.result.rows.map((row: { price: number; band: string }) => [row.price, row.band]),
    "chart rows are the table's rows",
  );
  assertEquals(data.rows.find((row) => row[1] === "you")![0], 300);
});

Deno.test("price_scenarios text states the ad spend and never shows a formula", async () => {
  for (const lang of ["ar", "en"]) {
    const r = await call("price_scenarios", { ...ARGS, lang });
    const text: string = r.content[0].text;
    assert(text.includes("1,000") || text.includes("1000"), `${lang}: states the ad spend`);
    // No arithmetic is ever shown. ("field=value" in the assumptions line is not a formula.)
    for (const sign of ["×", "÷", "(1 -", "(1 −", " * ", " / "]) {
      assert(!text.includes(sign), `${lang}: no "${sign}" in the seller-facing text`);
    }
    const body = text.split("\n").filter((l) =>
      !l.includes("افتراضات") && !l.includes("Assumptions")
    );
    for (const line of body) assert(!line.includes("="), `${lang}: no "=" outside assumptions`);
  }
});

Deno.test("market_costs returns sourced figures, or says nothing is published", async () => {
  const eg = (await call("market_costs", { market: "eg" })).structuredContent.result;
  assertEquals(eg.found, true);
  assertEquals(eg.returnShippingFee, 87);
  assert(eg.source.startsWith("https://"), "every figure carries its source");

  const kw = (await call("market_costs", { market: "KW" })).structuredContent.result;
  assertEquals(kw.found, false);
  assertEquals(kw.deliveryFeeLow, undefined, "no invented number for an unpublished market");
});

Deno.test("market costs match the sourced reference file", async () => {
  const json = JSON.parse(await Deno.readTextFile("reference/market-defaults.json"));
  for (const [code, costs] of Object.entries(MARKET_COSTS)) {
    const row = json.markets[code];
    assert(row, `${code} exists in the reference file`);
    assertEquals(costs.currency, row.currency, `${code} currency`);
    assertEquals(
      [costs.deliveryFeeLow, costs.deliveryFeeHigh],
      row.deliveryFeeBand,
      `${code} band`,
    );
    assertEquals(costs.returnShippingFee, row.returnShippingFee, `${code} return fee`);
    assert(row.sources.length > 0, `${code} is sourced`);
  }
  // A market with no published figure must not appear in the served table.
  for (
    const [code, row] of Object.entries(json.markets) as [string, { deliveryFeeBand: unknown }][]
  ) {
    if (!row.deliveryFeeBand) assertEquals(MARKET_COSTS[code], undefined, `${code} stays unserved`);
  }
});
