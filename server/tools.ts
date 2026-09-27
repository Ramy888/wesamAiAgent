/** The four Hesba calculator tools: schema, validation, defaults, engine call, envelope. */
import {
  type Campaign,
  checkCampaign,
  comparePrices,
  type Competitor,
  cpaTable,
  DEFAULT_MARGINS,
  DEFAULT_TIERS,
  type Offer,
  priceBundles,
  priceProduct,
  priceScenarios,
  type Product,
  type ScenarioCompetitor,
  type Tier,
  type Warning,
} from "../engine/canonical.ts";
import {
  AD_SPEND_SCHEMA,
  applyDefaults,
  type Assumption,
  CAMPAIGN_SCHEMA,
  COMPETITORS_SCHEMA,
  EXPORT_TEXT_SCHEMA,
  type FieldError,
  type Lang,
  MARGINS_SCHEMA,
  MARKET_SCHEMA,
  type ObjectSchema,
  OFFERS_SCHEMA,
  PRODUCT_FIELDS,
  productSchema,
  SCENARIO_COMPETITORS_SCHEMA,
  TIERS_SCHEMA,
  validate,
} from "./schema.ts";
import { type ChartKind, signChart } from "./charts.ts";
import { MARKET_COSTS, MARKETS_WITH_COSTS } from "./market-defaults.ts";
import { parseCampaignExport } from "./parse-export.ts";
import {
  bundlesText,
  campaignText,
  compareText,
  cpaTableText,
  errorsText,
  exportText,
  Fmt,
  marketCostsText,
  priceProductText,
  scenariosText,
} from "./text.ts";

export const ENGINE_VERSION = "0.1.0";

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  data: Record<string, unknown>;
}

/** Where chart links point and how they are signed; charts are omitted without it. */
export interface ChartContext {
  baseUrl: string;
  secret: string;
}

// deno-lint-ignore no-explicit-any
type Rounded = any;

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError: boolean;
}

interface Computed {
  result: unknown;
  warnings: Warning[];
  text: (f: Fmt) => string[];
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: ObjectSchema;
  /** Accepted but not used by this tool (never reported as assumptions). */
  ignored: string[];
  annotations: {
    title: string;
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
  compute: (v: Record<string, unknown>) => Computed;
  /** Charts built from the rounded result, so they always match the numbers in the answer. */
  charts: (r: Rounded, v: Record<string, unknown>) => ChartSpec[];
}

const PRICING_REQUIRED = [
  "productCost",
  "deliveryFee",
  "leadCpa",
  "confirmationRatePct",
  "deliveryRatePct",
];

const COMMON_NOTE = "All amounts must be in one currency (no conversion). " +
  "Optional fees default to 0 and every default used is listed in `assumptions`. " +
  "Never compute prices yourself; quote the numbers this tool returns.";

function toProduct(v: Record<string, unknown>): Product {
  const n = (k: string) => (v[k] as number | undefined) ?? 0;
  return {
    productCost: n("productCost"),
    customsDutyPerUnit: n("customsDutyPerUnit"),
    leadCpa: n("leadCpa"),
    confirmationRatePct: n("confirmationRatePct"),
    deliveryRatePct: n("deliveryRatePct"),
    deliveryFee: n("deliveryFee"),
    returnShippingFee: n("returnShippingFee"),
    packagingCost: n("packagingCost"),
    fulfillmentFee: n("fulfillmentFee"),
    callCenterCostPerLead: n("callCenterCostPerLead"),
    smsCostPerLead: n("smsCostPerLead"),
    platformFeePct: n("platformFeePct"),
    paymentGatewayPct: n("paymentGatewayPct"),
    paymentGatewayFixed: n("paymentGatewayFixed"),
    vatPct: n("vatPct"),
    marketerCommissionPct: n("marketerCommissionPct"),
    targetMarginPct: n("targetMarginPct"),
    codFeePct: n("codFeePct"),
    sellingPrice: v.sellingPrice as number | undefined,
  };
}

const annotations = (title: string): ToolDef["annotations"] => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const TOOLS: ToolDef[] = [
  {
    name: "price_product",
    title: "Price a product",
    description:
      "Price one cash-on-delivery product per delivered order: suggested and breakeven price, " +
      "and — if sellingPrice is given — net profit and margin at that price, max CPA per lead " +
      "(at breakeven and at the target margin), breakeven ROAS, the confirmation rate needed, " +
      "and a verdict (LOSS / BELOW_TARGET / ON_TARGET). " + COMMON_NOTE,
    inputSchema: productSchema(PRICING_REQUIRED),
    ignored: [],
    annotations: annotations("Price a product"),
    compute: (v) => {
      const r = priceProduct(toProduct(v));
      return {
        result: r,
        warnings: r.warnings,
        text: (f) => priceProductText(f, r, v.leadCpa as number),
      };
    },
    charts: (r, v) => [{
      kind: "cost",
      title: "فين بتروح فلوس كل أوردر؟ · Where each order's money goes",
      data: {
        cur: v.currency,
        price: v.sellingPrice ?? r.suggestedPrice,
        net: r.atSellingPrice?.netProfit ?? r.atSuggested?.netProfit ?? null,
        items: r.costBreakdown.map((c: { key: string; amount: number | null }) => [
          c.key,
          c.amount,
        ]),
      },
    }],
  },
  {
    name: "cpa_table",
    title: "CPA table",
    description:
      "Max ad cost per lead (CPA) the seller can pay at their selling price for a range of net " +
      "margins (default +20% … −20%), plus a headline at breakeven and at the target margin. " +
      "Negative-margin rows are never marked viable. " + COMMON_NOTE,
    inputSchema: productSchema(PRICING_REQUIRED, { margins: MARGINS_SCHEMA }, ["sellingPrice"]),
    ignored: [],
    annotations: annotations("CPA table"),
    compute: (v) => {
      const r = cpaTable(toProduct(v), (v.margins as number[] | undefined) ?? DEFAULT_MARGINS);
      return { result: r, warnings: r.warnings, text: (f) => cpaTableText(f, r) };
    },
    charts: (r, v) => [{
      kind: "cpa",
      title: "أقصى تكلفة ليد تقدر تدفعها · Max cost per lead by margin",
      data: {
        cur: v.currency,
        price: r.price,
        current: r.headline.currentLeadCpa,
        target: v.targetMarginPct,
        rows: r.rows.map((x: { marginPct: number; maxCpaPerLead: number; viable: boolean }) => [
          x.marginPct,
          x.maxCpaPerLead,
          x.viable,
        ]),
      },
    }],
  },
  {
    name: "price_bundles",
    title: "Price bundles and offers",
    description:
      "Price 2/3/4-piece bundles from target margins (with a 'was' price from the shown " +
      "discount), and check explicit offers such as 2 for 550. Shipping, operations, lead and ad " +
      "costs are paid once per order; only product cost scales with pieces. " +
      'Convert "buy X get Y free" to pieces = X+Y and totalPrice = X × single price first. ' +
      COMMON_NOTE,
    inputSchema: productSchema(PRICING_REQUIRED, { tiers: TIERS_SCHEMA, offers: OFFERS_SCHEMA }),
    ignored: [],
    annotations: annotations("Price bundles and offers"),
    compute: (v) => {
      const r = priceBundles(
        toProduct(v),
        (v.tiers as Tier[] | undefined) ?? DEFAULT_TIERS,
        (v.offers as Offer[] | undefined) ?? [],
      );
      return { result: r, warnings: r.warnings, text: (f) => bundlesText(f, r) };
    },
    charts: (r, v) => [{
      kind: "bundles",
      title: "ربح الأوردر في كل عرض · Profit per order by offer",
      data: {
        cur: v.currency,
        rows: [
          ...r.tiers.map((t: { pieces: number; price: number | null; profit: number | null }) => [
            "tier",
            t.pieces,
            t.price,
            t.profit,
          ]),
          ...r.offers.map((o: { pieces: number; totalPrice: number; profit: number }) => [
            "offer",
            o.pieces,
            o.totalPrice,
            o.profit,
          ]),
        ],
      },
    }],
  },
  {
    name: "compare_prices",
    title: "Compare with competitor prices",
    description:
      "Position the seller's price against competitor offers the seller has confirmed (from " +
      "ads, landing pages or marketplaces). For each offer: price per piece including any " +
      "shipping the customer pays, and the seller's profit, margin, max CPA and verdict if they " +
      "matched it. Summary: market min/median/max, a recommended price band " +
      "(PRICE_IN_BAND / PREMIUM_ONLY / CANNOT_COMPETE_ON_PRICE / NO_PROFITABLE_PRICE) and where " +
      "the seller's current price sits. Only pass prices the seller confirmed. " + COMMON_NOTE,
    inputSchema: productSchema(PRICING_REQUIRED, { competitors: COMPETITORS_SCHEMA }, [
      "competitors",
    ]),
    ignored: [],
    annotations: annotations("Compare with competitor prices"),
    compute: (v) => {
      const r = comparePrices(toProduct(v), v.competitors as Competitor[]);
      return { result: r, warnings: r.warnings, text: (f) => compareText(f, r) };
    },
    charts: (r, v) => [{
      kind: "market",
      title: "سعرك وسط المنافسين · Your price vs competitors",
      data: {
        cur: v.currency,
        // Capped and trimmed so the signed link stays short.
        comps: r.competitors.slice(0, 20).map((c: { label: string; pricePerPiece: number }) => [
          c.label.slice(0, 30),
          c.pricePerPiece,
        ]),
        you: r.seller?.price ?? null,
        breakeven: r.breakevenPrice,
        safe: r.suggestedPrice,
      },
    }],
  },
  {
    name: "check_campaign",
    title: "Check a campaign",
    description:
      "Real P&L of one ad campaign from its actual numbers (ad budget spent, leads, confirmed " +
      "and delivered orders) and unit costs, with a verdict (PAUSE / FIX / SCALE), max CPL for " +
      "the target margin, the price needed for the target, and the top lever. Confirmation " +
      "rate, delivery rate and lead CPA are read from the counts; if sent, they are ignored. " +
      COMMON_NOTE,
    inputSchema: productSchema(["productCost", "deliveryFee", "sellingPrice"], {
      campaign: CAMPAIGN_SCHEMA,
    }, ["campaign"]),
    ignored: ["leadCpa", "confirmationRatePct", "deliveryRatePct"],
    annotations: annotations("Check a campaign"),
    compute: (v) => {
      const r = checkCampaign(toProduct(v), v.campaign as Campaign);
      return { result: r, warnings: r.warnings, text: (f) => campaignText(f, r) };
    },
    charts: (r, v) => {
      const c = v.campaign as Campaign;
      return [{
        kind: "funnel",
        title: "من الليد للأوردر المدفوع · From lead to paid order",
        data: {
          cur: v.currency,
          leads: c.leads,
          confirmed: c.confirmed,
          delivered: c.delivered,
          rto: r.rtoCount,
          net: r.netProfit,
        },
      }];
    },
  },
  {
    name: "price_scenarios",
    title: "Price options side by side",
    description:
      "One table for a seller deciding what to charge: the breakeven price, the safe price, " +
      "steps around it, the seller's own price and each confirmed competitor price — with " +
      "profit per order, margin, and revenue and profit for a stated ad spend, plus a health " +
      "band per row (LOSS / CRITICAL / THIN / HEALTHY). The prices are chosen by this tool, " +
      "not by you. Best for beginners and whenever competitor prices are known. " + COMMON_NOTE,
    inputSchema: productSchema(PRICING_REQUIRED, {
      competitors: SCENARIO_COMPETITORS_SCHEMA,
      adSpend: AD_SPEND_SCHEMA,
    }),
    ignored: [],
    annotations: annotations("Price options side by side"),
    compute: (v) => {
      const r = priceScenarios(
        toProduct(v),
        (v.competitors as ScenarioCompetitor[] | undefined) ?? [],
        v.adSpend as number,
      );
      return { result: r, warnings: r.warnings, text: (f) => scenariosText(f, r) };
    },
    charts: (r, v) => [{
      kind: "scenarios",
      title: "الربح عند كل سعر · Profit at each price",
      data: {
        cur: v.currency,
        rows: r.rows.map((
          row: { price: number; who: string; kind: string; band: string; profitPerOrder: number },
        ) => [
          row.price,
          row.kind === "you" ? "you" : row.who.slice(0, 30),
          row.band,
          row.profitPerOrder,
        ]),
      },
    }],
  },
  {
    name: "market_costs",
    title: "Published shipping costs for a market",
    description:
      "What couriers publicly charge for delivery and returns in one market, with the source " +
      "link, for a seller who doesn't know their own numbers yet. Markets with published " +
      "figures: " + MARKETS_WITH_COSTS.join(", ") +
      ". Any other market returns found=false, which means ask the seller — never guess. " +
      "These are list prices: a seller with volume pays less. Show the figures, get the " +
      "seller's confirmation, then pass them to the pricing tools.",
    inputSchema: {
      type: "object",
      properties: {
        market: MARKET_SCHEMA,
        lang: PRODUCT_FIELDS.lang,
        currency: PRODUCT_FIELDS.currency,
      },
      required: ["market"],
      additionalProperties: false,
    },
    ignored: [],
    annotations: annotations("Published shipping costs for a market"),
    compute: (v) => {
      const code = String(v.market ?? "").toUpperCase();
      const m = MARKET_COSTS[code];
      const result = m ? { market: code, found: true, ...m } : {
        market: code,
        found: false,
        note:
          "No courier publishes a delivery or return price for this market. Ask the seller what " +
          "their courier charges.",
      };
      return {
        result,
        warnings: [],
        text: (f) => marketCostsText(f, result as unknown as Record<string, unknown>),
      };
    },
    charts: () => [],
  },
  {
    name: "read_campaign_export",
    title: "Read an ad report the seller pasted",
    description: "Turn an ad-platform report (Meta, TikTok or Google — pasted text, CSV, TSV or " +
      "semicolon, Arabic or English headers) into numbers: one row per campaign with spend, " +
      "impressions, clicks and results, plus totals summed by this tool. Pass the text " +
      "exactly as the seller gave it; never retype or total it yourself. Values this tool " +
      "cannot read come back as null with a warning — ask the seller for those. Read the rows " +
      "back to the seller and get a yes before using them in check_campaign.",
    inputSchema: {
      type: "object",
      properties: {
        text: EXPORT_TEXT_SCHEMA,
        lang: PRODUCT_FIELDS.lang,
        currency: PRODUCT_FIELDS.currency,
      },
      required: ["text"],
      additionalProperties: false,
    },
    ignored: [],
    annotations: annotations("Read an ad report the seller pasted"),
    compute: (v) => {
      const r = parseCampaignExport(String(v.text ?? ""));
      return {
        result: r,
        // Export warnings are their own vocabulary; they travel in the result, not as engine warnings.
        warnings: [],
        text: (f) => exportText(f, r as unknown as Record<string, unknown>),
      };
    },
    charts: () => [],
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Rounds every number to 4 decimals for the structured payload. */
export function round4(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1e4) / 1e4 + 0; // + 0 turns -0 into 0
  if (Array.isArray(value)) return value.map(round4);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round4(v)]));
  }
  return value;
}

function pickLang(args: Record<string, unknown>): Lang {
  return args.lang === "en" || args.lang === "fr" ? args.lang : "ar";
}

export function runTool(tool: ToolDef, rawArgs: unknown, charts?: ChartContext): ToolResult {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = validate(tool.inputSchema, args);
  if (errors.length) {
    return {
      content: [{ type: "text", text: errorsText(pickLang(args), errors) }],
      structuredContent: { tool: tool.name, engineVersion: ENGINE_VERSION, errors },
      isError: true,
    };
  }
  const { values, assumptions } = applyDefaults(tool.inputSchema, args, tool.ignored);
  const { result, warnings, text } = tool.compute(values);
  const fmt = new Fmt(values.lang as Lang, values.currency as string);
  const structured = round4({
    tool: tool.name,
    engineVersion: ENGINE_VERSION,
    inputsUsed: values,
    assumptions,
    warnings,
    result,
  }) as Record<string, unknown>;
  const lines = [...text(fmt), ...fmt.tail(warnings, assumptions as Assumption[])];
  if (charts) {
    const refs = tool.charts(structured.result, values).map((c) => ({
      key: c.kind,
      title: c.title,
      url: `${charts.baseUrl}/chart/${c.kind}/${signChart(c.kind, c.data, charts.secret)}.svg`,
    }));
    structured.charts = refs;
    // Titles are "Arabic · English"; the image caption follows the answer language.
    const caption = (t: string) => t.split(" · ")[values.lang === "ar" ? 0 : 1] ?? t;
    lines.push("", ...refs.map((c) => `![${caption(c.title)}](${c.url})`));
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: structured,
    isError: false,
  };
}
