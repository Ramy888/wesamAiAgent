// Charts: signed, stateless SVG links built by the tools from their own results.
import { assert, assertEquals, assertMatch } from "@std/assert";
import { CHART_KINDS, renderChart, signChart, verifyChart } from "../server/charts.ts";
import { createHandler } from "../server/mcp.ts";

const SECRET = "test-chart-secret";
const BASE = "https://calc.example";
const handler = createHandler({
  tokens: ["t0k"],
  chartSecret: SECRET,
  publicBaseUrl: BASE,
  rateLimitPerMinute: 10_000,
});

const U = {
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

let id = 1;
async function call(name: string, args: Record<string, unknown>) {
  const res = await handler(
    new Request("http://x/mcp/t0k", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: id++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  return (await res.json()).result;
}

const get = (path: string) => handler(new Request(`http://x${path}`));

type ChartRef = { key: string; title: string; url: string };

function tokenOf(url: string): { kind: string; token: string } {
  const m = url.match(/\/chart\/([a-z]+)\/([^/]+)\.svg$/);
  assert(m, `chart url shape: ${url}`);
  return { kind: m[1], token: m[2] };
}

function decode(ref: ChartRef) {
  const { kind, token } = tokenOf(ref.url);
  const data = verifyChart(kind, token, SECRET);
  assert(data, `signature verifies for ${ref.key}`);
  return { kind, data: data as Record<string, unknown> };
}

// ─── signing ────────────────────────────────────────────────────────────────

Deno.test("chart: sign/verify round-trip; tampering and kind swaps are rejected", () => {
  const data = { cur: "EGP", items: [["productCost", 110]] };
  const token = signChart("cost", data, SECRET);
  assertEquals(verifyChart("cost", token, SECRET), data);
  assertEquals(verifyChart("cpa", token, SECRET), null, "signature is bound to the kind");
  assertEquals(verifyChart("cost", token, "other-secret"), null);
  const [payload, sig] = token.split(".");
  const forged = signChart("cost", { ...data, items: [["productCost", 1]] }, SECRET).split(".")[0];
  assertEquals(verifyChart("cost", `${forged}.${sig}`, SECRET), null);
  assertEquals(verifyChart("cost", `${payload}.${"0".repeat(sig.length)}`, SECRET), null);
  assertEquals(verifyChart("cost", "garbage", SECRET), null);
});

// ─── endpoint ───────────────────────────────────────────────────────────────

Deno.test("chart endpoint: serves safe, cacheable SVG", async () => {
  const r = await call("price_product", U);
  const ref = r.structuredContent.charts[0] as ChartRef;
  const path = new URL(ref.url).pathname;
  const res = await get(path);
  assertEquals(res.status, 200);
  assertMatch(res.headers.get("content-type")!, /^image\/svg\+xml/);
  assertMatch(res.headers.get("cache-control")!, /immutable/);
  assertMatch(res.headers.get("content-security-policy")!, /default-src 'none'/);
  const svg = await res.text();
  assert(svg.startsWith("<svg"), "svg root");
  for (const bad of ["<script", 'href="http', "@import", "javascript:"]) {
    assert(!svg.includes(bad), `no ${bad}`);
  }
});

Deno.test("chart endpoint: 400 tampered, 404 unknown kind, 414 oversized, 405 non-GET", async () => {
  const token = signChart("cost", { cur: "EGP", items: [] }, SECRET);
  const [payload] = token.split(".");
  const bad = await get(`/chart/cost/${payload}.${"a".repeat(24)}.svg`);
  assertEquals(bad.status, 400);
  await bad.body?.cancel();
  const unknown = await get(`/chart/pie/${token}.svg`);
  assertEquals(unknown.status, 404);
  await unknown.body?.cancel();
  const long = await get(`/chart/cost/${"a".repeat(5000)}.${"b".repeat(24)}.svg`);
  assertEquals(long.status, 414);
  await long.body?.cancel();
  const post = await handler(new Request(`http://x/chart/cost/${token}.svg`, { method: "POST" }));
  assertEquals(post.status, 405);
  await post.body?.cancel();
});

// ─── tools return charts that match their own results ───────────────────────

Deno.test("charts: price_product cost chart carries the exact breakdown and net profit", async () => {
  const r = await call("price_product", U);
  const sc = r.structuredContent;
  const refs = sc.charts as ChartRef[];
  assertEquals(refs.map((c) => c.key), ["cost"]);
  assert(refs[0].url.startsWith(`${BASE}/chart/cost/`), "absolute URL on the public base");
  const { data } = decode(refs[0]);
  const items = data.items as [string, number | null][];
  assertEquals(
    items.map(([k, v]) => [k, v]),
    sc.result.costBreakdown.map((c: { key: string; amount: number }) => [c.key, c.amount]),
  );
  assertEquals(data.net, sc.result.atSellingPrice.netProfit);
  assertEquals(data.price, 300);
  assertMatch(r.content[0].text, /!\[[^\]]+\]\(https:\/\/calc\.example\/chart\/cost\//);
});

Deno.test("charts: cpa_table rows, market strip, funnel and bundle profits match results", async () => {
  const cpa = (await call("cpa_table", U)).structuredContent;
  const cpaData = decode(cpa.charts[0]).data;
  assertEquals(
    cpaData.rows,
    cpa.result.rows.map((x: { marginPct: number; maxCpaPerLead: number; viable: boolean }) => [
      x.marginPct,
      x.maxCpaPerLead,
      x.viable,
    ]),
  );
  assertEquals(cpaData.current, 15);

  const cmp = (await call("compare_prices", {
    ...U,
    competitors: [{ label: "A", totalPrice: 279 }, { label: "D", totalPrice: 550, pieces: 2 }],
  })).structuredContent;
  const m = decode(cmp.charts[0]).data;
  assertEquals(m.comps, [["A", 279], ["D", 275]]);
  assertEquals(m.you, 300);
  assertEquals(m.breakeven, cmp.result.breakevenPrice);
  assertEquals(m.safe, cmp.result.suggestedPrice);

  const camp = (await call("check_campaign", {
    ...U,
    campaign: { adBudgetSpent: 1000, leads: 100, confirmed: 50, delivered: 40 },
  })).structuredContent;
  const f = decode(camp.charts[0]).data;
  assertEquals([f.leads, f.confirmed, f.delivered, f.rto], [100, 50, 40, 10]);
  assertEquals(f.net, camp.result.netProfit);

  const b = (await call("price_bundles", {
    ...U,
    offers: [{ pieces: 2, totalPrice: 550 }],
  })).structuredContent;
  const bd = decode(b.charts[0]).data;
  const rows = bd.rows as [string, number, number, number | null][];
  assertEquals(rows.length, 4);
  assertEquals(rows[0], ["tier", 2, b.result.tiers[0].price, b.result.tiers[0].profit]);
  assertEquals(rows[3], ["offer", 2, 550, b.result.offers[0].profit]);
});

Deno.test("charts: every tool returns at least one chart; kinds are known", async () => {
  const runs: [string, Record<string, unknown>][] = [
    ["price_product", U],
    ["cpa_table", U],
    ["price_bundles", U],
    ["compare_prices", { ...U, competitors: [{ label: "A", totalPrice: 279 }] }],
    ["check_campaign", {
      ...U,
      campaign: { adBudgetSpent: 1000, leads: 100, confirmed: 50, delivered: 40 },
    }],
  ];
  for (const [name, args] of runs) {
    const refs = (await call(name, args)).structuredContent.charts as ChartRef[];
    assert(refs.length >= 1, name);
    for (const ref of refs) {
      const { kind } = decode(ref);
      assert(CHART_KINDS.includes(kind as typeof CHART_KINDS[number]), kind);
      assert(ref.title.length > 5, "has a title");
      const res = await get(new URL(ref.url).pathname);
      assertEquals(res.status, 200, `${name} chart renders`);
      await res.body?.cancel();
    }
  }
});

Deno.test("charts: validation errors return no charts", async () => {
  const r = await call("price_product", {});
  assertEquals(r.isError, true);
  assertEquals(r.structuredContent.charts, undefined);
});

// ─── rendering ──────────────────────────────────────────────────────────────

Deno.test("render: user text is escaped; null values show a dash; currency decimals apply", () => {
  const svg = renderChart("market", {
    cur: "KWD",
    comps: [['<script>alert(1)</script> & "x"', 12.3456]],
    you: 10,
    breakeven: null,
    safe: null,
  });
  assert(!svg.includes("<script>"), "raw script tag must not appear");
  assert(svg.includes("&lt;script&gt;"), "label is escaped");
  assert(svg.includes("12.346"), "KWD uses 3 decimals");
  assert(svg.includes("—"), "null renders as a dash");
  assert(!svg.includes("null") && !svg.includes("NaN") && !svg.includes("undefined"));
});

Deno.test("render: bilingual titles and labels", () => {
  const svg = renderChart("cost", {
    cur: "EGP",
    price: 300,
    net: 2.19,
    items: [["productCost", 110], ["adCostPerDelivered", 55.56]],
  });
  assert(/[؀-ۿ]/.test(svg), "Arabic text present");
  assertMatch(svg, /Where each order/);
  assertMatch(svg, /Product cost/);
  assertMatch(svg, /\b300\.00\b/);
});

Deno.test("render: loss is labelled in text, not only by color", () => {
  const svg = renderChart("cost", { cur: "EGP", price: 250, net: -33.2, items: [] });
  assertMatch(svg, /Loss · خسارة/);
  assertMatch(svg, /-33\.20/);
});

Deno.test("render: rejects malformed data instead of drawing garbage", () => {
  let threw = false;
  try {
    renderChart("cost", { cur: "EGP", items: "nope" } as unknown as Record<string, unknown>);
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("chart rate limit is per client address", async () => {
  const limited = createHandler({ tokens: ["t"], chartSecret: SECRET, rateLimitPerMinute: 1 });
  const token = signChart("cost", { cur: "EGP", items: [] }, SECRET);
  const hit = async (ip: string) => {
    const r = await limited(new Request(`http://x/chart/cost/${token}.svg`), {
      remoteAddr: { hostname: ip },
    });
    await r.body?.cancel();
    return r.status;
  };
  assertEquals(await hit("1.1.1.1"), 200);
  assertEquals(await hit("1.1.1.1"), 200); // chart budget is 2× the MCP limit
  assertEquals(await hit("1.1.1.1"), 429);
  assertEquals(await hit("2.2.2.2"), 200, "another client is unaffected");
});
