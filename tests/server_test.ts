// Validation (test plan §V) and MCP protocol (§M) layers, driven in-process.
import { assert, assertAlmostEquals, assertEquals, assertMatch } from "@std/assert";
import { createHandler } from "../server/mcp.ts";
import { TOOLS } from "../server/tools.ts";
import { validate } from "../server/schema.ts";

const logs: unknown[] = [];
const handler = createHandler({
  tokens: ["t0k"],
  log: (e) => logs.push(e),
  rateLimitPerMinute: 10_000,
});
const URL_OK = "http://x/mcp/t0k";

async function rpc(body: unknown, url = URL_OK, init: RequestInit = {}) {
  const res = await handler(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }),
  );
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

let nextId = 1;
const call = (name: string, args: Record<string, unknown>) =>
  rpc({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });

/** Fixture U as flat tool arguments (golden Ultimate input, seller price 300). */
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

const REQUIRED_BY_TOOL: Record<string, string[]> = {
  price_product: [
    "productCost",
    "deliveryFee",
    "leadCpa",
    "confirmationRatePct",
    "deliveryRatePct",
  ],
  cpa_table: [
    "productCost",
    "deliveryFee",
    "leadCpa",
    "confirmationRatePct",
    "deliveryRatePct",
    "sellingPrice",
  ],
  price_bundles: [
    "productCost",
    "deliveryFee",
    "leadCpa",
    "confirmationRatePct",
    "deliveryRatePct",
  ],
  check_campaign: ["productCost", "deliveryFee", "sellingPrice", "campaign"],
  compare_prices: [
    "productCost",
    "deliveryFee",
    "leadCpa",
    "confirmationRatePct",
    "deliveryRatePct",
    "competitors",
  ],
};

const CAMPAIGN = { adBudgetSpent: 1000, leads: 100, confirmed: 50, delivered: 40 };

// ─── M: protocol ────────────────────────────────────────────────────────────

Deno.test("M1: initialize echoes a known protocol version and advertises tools", async () => {
  const { res, json } = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t", version: "1" },
    },
  });
  assertEquals(res.status, 200);
  assertMatch(res.headers.get("content-type")!, /application\/json/);
  assertEquals(json.result.protocolVersion, "2025-06-18");
  assert(json.result.capabilities.tools);
  assertEquals(json.result.serverInfo.name, "hesba-calculator");
});

Deno.test("M1: unknown protocol version gets the latest supported one", async () => {
  const { json } = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "1999-01-01" },
  });
  assertEquals(json.result.protocolVersion, "2025-11-25");
});

Deno.test("M2: notifications get 202 with no body", async () => {
  const { res, json } = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assertEquals(res.status, 202);
  assertEquals(json, null);
});

Deno.test("M3: tools/list returns the 5 tools with schemas and read-only annotations", async () => {
  const { json } = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const tools = json.result.tools;
  assertEquals(tools.map((t: { name: string }) => t.name).sort(), [
    "check_campaign",
    "compare_prices",
    "cpa_table",
    "price_bundles",
    "price_product",
  ]);
  for (const t of tools) {
    assertEquals(t.inputSchema.type, "object");
    assertEquals(t.inputSchema.additionalProperties, false);
    assertEquals(t.annotations.readOnlyHint, true);
    assertEquals(t.annotations.destructiveHint, false);
    assertEquals(t.annotations.openWorldHint, false);
    assert(t.description.length > 40);
  }
});

Deno.test("M4: no tool name matches Wesam's excluded action words (derived from tools/list)", async () => {
  const { json } = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  for (const t of json.result.tools) {
    assert(!/publish|send|spend|delete|admin|pay|buy/i.test(t.name), t.name);
  }
});

Deno.test("M5: schema and validator agree for every tool (derived)", () => {
  for (const tool of TOOLS) {
    const schema = tool.inputSchema;
    assertEquals(
      [...schema.required].sort(),
      [...REQUIRED_BY_TOOL[tool.name]].sort(),
      `${tool.name} required fields match spec §2.4.1`,
    );
    for (const field of schema.required) {
      const errs = validate(schema, {});
      assert(errs.some((e) => e.field === field && e.code === "required"), `${tool.name}.${field}`);
    }
    const unknown = validate(schema, { notAField: 1 });
    assert(unknown.some((e) => e.field === "notAField" && e.code === "unknown_field"));
  }
});

Deno.test("M6: price_product over MCP returns the canonical numbers", async () => {
  const { json } = await call("price_product", { ...U, lang: "en" });
  const r = json.result;
  assertEquals(r.isError, false);
  const sc = r.structuredContent;
  assertEquals(sc.tool, "price_product");
  assertAlmostEquals(sc.result.suggestedPrice, 345.2273, 1e-4);
  assertAlmostEquals(sc.result.atSellingPrice.netProfit, 2.1852, 1e-4);
  assertEquals(sc.result.verdict.code, "BELOW_TARGET");
  assertEquals(r.content[0].type, "text");
  assertMatch(r.content[0].text, /345\.23/);
  assertMatch(r.content[0].text, /2\.19/);
});

Deno.test("M7: unknown tool, unknown method, malformed JSON, invalid request", async () => {
  const unknownTool = await call("send_money", {});
  assertEquals(unknownTool.json.error.code, -32602);
  const unknownMethod = await rpc({ jsonrpc: "2.0", id: 9, method: "resources/list" });
  assertEquals(unknownMethod.json.error.code, -32601);
  const bad = await rpc("{not json");
  assertEquals(bad.res.status, 400);
  assertEquals(bad.json.error.code, -32700);
  const invalid = await rpc({ id: 3, method: 5 });
  assertEquals(invalid.json.error.code, -32600);
});

Deno.test("M7: batches return one response per request and skip notifications", async () => {
  const { json } = await rpc([
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  assertEquals(json.length, 2);
  assertEquals(json[0].id, 1);
  assertEquals(json[0].result, {});
});

Deno.test("M8: stateless — any or no session id works", async () => {
  const a = await rpc({ jsonrpc: "2.0", id: 1, method: "ping" });
  const b = await rpc({ jsonrpc: "2.0", id: 2, method: "ping" }, URL_OK, {
    headers: { "content-type": "application/json", "mcp-session-id": "made-up" },
  });
  assertEquals(a.res.status, 200);
  assertEquals(b.res.status, 200);
});

Deno.test("M9/M11: wrong token and bare /mcp → 404; GET on the endpoint → 405", async () => {
  assertEquals(
    (await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "http://x/mcp/nope")).res.status,
    404,
  );
  assertEquals(
    (await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "http://x/mcp")).res.status,
    404,
  );
  const get = await handler(new Request(URL_OK));
  assertEquals(get.status, 405);
  await get.body?.cancel();
});

Deno.test("M10: body over 32 KB → 413", async () => {
  const big = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "ping",
    params: { pad: "x".repeat(33_000) },
  });
  assertEquals((await rpc(big)).res.status, 413);
});

Deno.test("M12: health check", async () => {
  const res = await handler(new Request("http://x/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
});

Deno.test("M13: logs never contain input values", async () => {
  logs.length = 0;
  await call("price_product", { ...U, productCost: 987654.321 });
  const dump = JSON.stringify(logs);
  assert(logs.length > 0);
  assert(!dump.includes("987654"), dump);
});

Deno.test("M14: check_campaign ignores CR, DR and lead CPA", async () => {
  const base = { ...U, targetMarginPct: 20, campaign: CAMPAIGN };
  const { leadCpa: _l, confirmationRatePct: _c, deliveryRatePct: _d, ...withoutRates } = base;
  const without = await call("check_campaign", withoutRates);
  assertEquals(without.json.result.isError, false);
  const withRates = await call("check_campaign", base);
  const a = without.json.result.structuredContent;
  const b = withRates.json.result.structuredContent;
  assertEquals(a.result.revenue, 12000);
  assert(
    !a.assumptions.some((x: { field: string }) =>
      ["confirmationRatePct", "deliveryRatePct", "leadCpa"].includes(x.field)
    ),
  );
  assert(
    !b.assumptions.some((x: { field: string }) =>
      ["confirmationRatePct", "deliveryRatePct", "leadCpa"].includes(x.field)
    ),
  );
  for (const f of ["confirmationRatePct", "deliveryRatePct", "leadCpa"]) {
    assert(!(f in b.inputsUsed), `ignored field ${f} must not be echoed as used`);
  }
  assertEquals(a.result, b.result);
});

// ─── V: validation ──────────────────────────────────────────────────────────

Deno.test("V1: missing required field → isError with field list, per tool", async () => {
  for (const tool of TOOLS) {
    const { json } = await call(tool.name, {});
    const r = json.result;
    assertEquals(r.isError, true, tool.name);
    const fields = r.structuredContent.errors.map((e: { field: string }) => e.field);
    for (const f of REQUIRED_BY_TOOL[tool.name]) assert(fields.includes(f), `${tool.name}: ${f}`);
  }
});

Deno.test("V2: range errors", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ ...U, productCost: -1 }, "productCost"],
    [{ ...U, vatPct: 100 }, "vatPct"],
    [{ ...U, confirmationRatePct: 0 }, "confirmationRatePct"],
    [{ ...U, deliveryRatePct: 101 }, "deliveryRatePct"],
    [{ ...U, sellingPrice: 0 }, "sellingPrice"],
    [{ ...U, targetMarginPct: 100 }, "targetMarginPct"],
    [{ ...U, productCost: 2e9 }, "productCost"],
  ];
  for (const [args, field] of cases) {
    const errs = (await call("price_product", args)).json.result.structuredContent.errors;
    assert(
      errs.some((e: { field: string; code: string }) => e.field === field && e.code === "range"),
      field,
    );
  }
});

Deno.test("V3: type errors (strings, NaN-like, huge exponent)", async () => {
  for (const bad of ["100", "NaN", "1e999", null, true]) {
    const errs =
      (await call("price_product", { ...U, productCost: bad })).json.result.structuredContent
        .errors;
    assert(
      errs.some((e: { field: string; code: string }) =>
        e.field === "productCost" && e.code === "type"
      ),
      String(bad),
    );
  }
  // 1e999 as a JSON number literal parses to Infinity.
  const raw = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "price_product", arguments: { ...U, productCost: 0 } },
  })
    .replace('"productCost":0', '"productCost":1e999');
  const { json } = await rpc(raw);
  assert(
    json.result.structuredContent.errors.some((e: { field: string }) => e.field === "productCost"),
  );
});

Deno.test("V4: unknown field (typo) is rejected", async () => {
  const errs =
    (await call("price_product", { ...U, deliveryRate: 45 })).json.result.structuredContent.errors;
  assert(
    errs.some((e: { field: string; code: string }) =>
      e.field === "deliveryRate" && e.code === "unknown_field"
    ),
  );
});

Deno.test("V5: defaults applied are listed; supplied fields are not", async () => {
  const minimal = {
    productCost: 100,
    deliveryFee: 25,
    leadCpa: 15,
    confirmationRatePct: 60,
    deliveryRatePct: 45,
  };
  const sc = (await call("price_product", minimal)).json.result.structuredContent;
  const fields = sc.assumptions.map((a: { field: string }) => a.field);
  for (const f of ["vatPct", "returnShippingFee", "targetMarginPct", "currency"]) {
    assert(fields.includes(f), f);
  }
  for (const f of Object.keys(minimal)) assert(!fields.includes(f), f);
  assertEquals(sc.inputsUsed.targetMarginPct, 20);
  assertEquals(sc.inputsUsed.vatPct, 0);
});

Deno.test("V6: language changes the text only", async () => {
  const ar = (await call("price_product", { ...U, lang: "ar" })).json.result;
  const en = (await call("price_product", { ...U, lang: "en" })).json.result;
  assertMatch(ar.content[0].text, /[؀-ۿ]/);
  assert(!/[؀-ۿ]/.test(en.content[0].text));
  assertEquals(ar.structuredContent.result, en.structuredContent.result);
});

Deno.test("V7: currency decimals in text; structured result unchanged", async () => {
  const kwd = (await call("price_product", { ...U, currency: "KWD", lang: "en" })).json.result;
  const iqd = (await call("price_product", { ...U, currency: "IQD", lang: "en" })).json.result;
  const egp = (await call("price_product", { ...U, currency: "EGP", lang: "en" })).json.result;
  assertMatch(kwd.content[0].text, /345\.227 KWD/);
  assertMatch(iqd.content[0].text, /345 IQD/);
  assertMatch(egp.content[0].text, /345\.23 EGP/);
  assertEquals(kwd.structuredContent.result, egp.structuredContent.result);
});

Deno.test("V8: unknown currency or malformed market → range error", async () => {
  const a =
    (await call("price_product", { ...U, currency: "XYZ" })).json.result.structuredContent.errors;
  assert(
    a.some((e: { field: string; code: string }) => e.field === "currency" && e.code === "range"),
  );
  const b =
    (await call("price_product", { ...U, market: "egypt" })).json.result.structuredContent.errors;
  assert(
    b.some((e: { field: string; code: string }) => e.field === "market" && e.code === "range"),
  );
});

Deno.test("tools: nested campaign, tiers and offers are validated", async () => {
  const c =
    (await call("check_campaign", { ...U, campaign: { ...CAMPAIGN, leads: -1, extra: 1 } })).json
      .result
      .structuredContent.errors;
  assert(c.some((e: { field: string }) => e.field === "campaign.leads"));
  assert(c.some((e: { field: string }) => e.field === "campaign.extra"));
  const b =
    (await call("price_bundles", { ...U, offers: [{ pieces: 1.5, totalPrice: 10 }] })).json.result
      .structuredContent.errors;
  assert(b.some((e: { field: string }) => e.field === "offers[0].pieces"));
});

Deno.test("tools: every tool succeeds on valid input and returns finite rounded numbers", async () => {
  const runs: [string, Record<string, unknown>][] = [
    ["price_product", U],
    ["cpa_table", U],
    ["price_bundles", { ...U, offers: [{ pieces: 2, totalPrice: 550 }] }],
    ["check_campaign", { ...U, campaign: CAMPAIGN }],
    ["compare_prices", {
      ...U,
      competitors: [{ label: "A", totalPrice: 279 }, { label: "D", totalPrice: 550, pieces: 2 }],
    }],
  ];
  for (const [name, args] of runs) {
    const r = (await call(name, args)).json.result;
    assertEquals(r.isError, false, name);
    assert(r.content[0].text.length > 20, name);
    const walk = (v: unknown): void => {
      if (typeof v === "number") {
        assert(Number.isFinite(v));
        assertEquals(Math.round(v * 1e4) / 1e4, v);
      } else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(r.structuredContent);
  }
});

Deno.test("rate limit: 60 per minute per token, then 429 until the window resets", async () => {
  let clock = 0;
  const limited = createHandler({ tokens: ["a", "b"], now: () => clock });
  const ping = (tok: string) =>
    limited(
      new Request(`http://x/mcp/${tok}`, {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      }),
    );
  for (let i = 0; i < 60; i++) assertEquals((await ping("a")).status, 200);
  const blocked = await ping("a");
  assertEquals(blocked.status, 429);
  await blocked.body?.cancel();
  assertEquals((await ping("b")).status, 200, "other tokens are unaffected");
  clock += 60_000;
  assertEquals((await ping("a")).status, 200, "window resets");
});

Deno.test("compare_prices over MCP: defaults, validation and text", async () => {
  const ok = (await call("compare_prices", {
    ...U,
    lang: "en",
    competitors: [
      { label: "A", totalPrice: 279, source: "https://example.com/a", seenOn: "2026-09-17" },
      { label: "B", totalPrice: 299, shippingCharged: 30 },
      { label: "C", totalPrice: 349 },
      { label: "D", totalPrice: 550, pieces: 2 },
      { label: "E", totalPrice: 399 },
    ],
  })).json.result;
  assertEquals(ok.isError, false);
  const sc = ok.structuredContent;
  assertEquals(sc.result.recommendation.code, "PREMIUM_ONLY");
  assertEquals(sc.inputsUsed.competitors[0].pieces, 1, "nested default applied");
  assertEquals(sc.inputsUsed.competitors[0].shippingCharged, 0, "nested default applied");
  assertMatch(ok.content[0].text, /position premium: 345\.23 EGP – 399\.00 EGP/);
  assertMatch(ok.content[0].text, /A: 279\.00 EGP per piece/);

  const bad = (await call("compare_prices", {
    ...U,
    competitors: [{ label: "x".repeat(81), totalPrice: 0, seenOn: "17/09/2026" }],
  })).json.result.structuredContent.errors.map((e: { field: string }) => e.field);
  for (const f of ["competitors[0].label", "competitors[0].totalPrice", "competitors[0].seenOn"]) {
    assert(bad.includes(f), f);
  }
  const empty = (await call("compare_prices", { ...U, competitors: [] })).json.result;
  assertEquals(empty.isError, true);
});
