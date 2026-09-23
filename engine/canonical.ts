/**
 * Canonical pricing model used by every MCP tool (specs/spec.md §2.6–2.7).
 *
 * It is Bine's Ultimate model evaluated at the seller's own price, with one percentage stack
 * everywhere. Values that are undefined (for example a suggested price when the stack plus the
 * target margin reach 100%) are `null`, never 0, NaN or Infinity.
 *
 * Open decision (bug #8): packaging, fulfillment and the fixed gateway fee are counted per
 * delivered order, as in Bine. See specs/spec.md §5.
 */

export interface Product {
  productCost: number;
  customsDutyPerUnit: number;
  leadCpa: number;
  confirmationRatePct: number;
  deliveryRatePct: number;
  deliveryFee: number;
  returnShippingFee: number;
  packagingCost: number;
  fulfillmentFee: number;
  callCenterCostPerLead: number;
  smsCostPerLead: number;
  platformFeePct: number;
  paymentGatewayPct: number;
  paymentGatewayFixed: number;
  vatPct: number;
  marketerCommissionPct: number;
  targetMarginPct: number;
  sellingPrice?: number;
}

export type WarningCode =
  | "STACK_GE_100"
  | "STACK_PLUS_MARGIN_GE_100"
  | "PRICE_BELOW_BREAKEVEN"
  | "CPA_ABOVE_MAX"
  | "REQUIRED_CR_UNREACHABLE"
  | "NEGATIVE_TARGET_MARGIN"
  | "COUNTS_INCONSISTENT"
  | "NO_DELIVERIES"
  | "NO_AD_BUDGET"
  | "OFFER_BELOW_BREAKEVEN"
  | "FEW_COMPETITORS"
  | "VOLUME_UNDEFINED";

export interface Warning {
  code: WarningCode;
  detail?: Record<string, number | string>;
}

export type PriceVerdict = "LOSS" | "BELOW_TARGET" | "ON_TARGET";
export type CampaignVerdict = "PAUSE" | "FIX" | "SCALE";

export type CostKey =
  | "productCost"
  | "blendedShipping"
  | "operations"
  | "leadProcessing"
  | "gatewayFixed"
  | "revenuePctStack"
  | "adCostPerDelivered";

export interface CostItem {
  key: CostKey;
  amount: number | null;
}

// ─── unit economics (per delivered order) ───────────────────────────────────

export interface Economics {
  successRatePct: number;
  leadsPerDelivered: number;
  blendedShipping: number;
  unitProductCost: number;
  operationsCost: number;
  leadProcessingCost: number;
  /** Fixed costs per delivered order, excluding lead processing. */
  fixedCostsExLead: number;
  fixedCostsPerDelivered: number;
  pctStack: number;
  adCostPerDelivered: number;
  breakevenPrice: number | null;
  suggestedPrice: number | null;
}

const EPS = 1e-12;

export function economics(p: Product): Economics {
  const cr = p.confirmationRatePct / 100;
  const dr = p.deliveryRatePct / 100;
  if (!(cr > 0 && cr <= 1 && dr > 0 && dr <= 1)) {
    throw new RangeError("Confirmation and delivery rates must be above 0% and at most 100%.");
  }
  const sr = cr * dr;
  const leadsPerDelivered = 1 / sr;
  const blendedShipping = p.deliveryFee * dr + p.returnShippingFee * (1 - dr);
  const unitProductCost = p.productCost + p.customsDutyPerUnit;
  const operationsCost = p.packagingCost + p.fulfillmentFee;
  const leadProcessingCost = leadsPerDelivered * (p.callCenterCostPerLead + p.smsCostPerLead);
  const fixedCostsExLead = unitProductCost + blendedShipping + operationsCost +
    p.paymentGatewayFixed;
  const fixedCostsPerDelivered = fixedCostsExLead + leadProcessingCost;
  const pctStack = (p.vatPct + p.platformFeePct + p.marketerCommissionPct + p.paymentGatewayPct) /
    100;
  const adCostPerDelivered = p.leadCpa * leadsPerDelivered;
  const tm = p.targetMarginPct / 100;
  const total = fixedCostsPerDelivered + adCostPerDelivered;
  return {
    successRatePct: sr * 100,
    leadsPerDelivered,
    blendedShipping,
    unitProductCost,
    operationsCost,
    leadProcessingCost,
    fixedCostsExLead,
    fixedCostsPerDelivered,
    pctStack,
    adCostPerDelivered,
    breakevenPrice: 1 - pctStack > EPS ? total / (1 - pctStack) : null,
    suggestedPrice: 1 - pctStack - tm > EPS ? total / (1 - pctStack - tm) : null,
  };
}

/** Max CPA per lead at price `price` while keeping net margin `marginPct`. */
const maxCpaAt = (e: Economics, price: number, marginPct: number) =>
  (price * (1 - e.pctStack - marginPct / 100) - e.fixedCostsPerDelivered) * e.successRatePct / 100;

export interface AtPrice {
  price: number;
  grossProfit: number;
  netProfit: number;
  netMarginPct: number;
  maxCpaBreakeven: number;
  maxCpaAtTarget: number;
  breakEvenRoas: number | null;
  /** CR needed to hit the target margin at this price and CPA; null when no CR can. */
  requiredCrPct: number | null;
}

function atPrice(p: Product, e: Economics, price: number): AtPrice {
  const grossProfit = price * (1 - e.pctStack) - e.fixedCostsPerDelivered;
  const netProfit = grossProfit - e.adCostPerDelivered;
  // Lead processing also scales with 1/CR, so solve for CR exactly:
  // (price·(1−stack−tm) − fixedExLead)·CR·DR = leadCpa + callCenter + sms
  const perLeadCosts = p.leadCpa + p.callCenterCostPerLead + p.smsCostPerLead;
  const contributionPerConfirmed = (price * (1 - e.pctStack - p.targetMarginPct / 100) -
    e.fixedCostsExLead) * (p.deliveryRatePct / 100);
  return {
    price,
    grossProfit,
    netProfit,
    netMarginPct: (netProfit / price) * 100,
    maxCpaBreakeven: maxCpaAt(e, price, 0),
    maxCpaAtTarget: maxCpaAt(e, price, p.targetMarginPct),
    breakEvenRoas: grossProfit > EPS ? price / grossProfit : null,
    requiredCrPct: contributionPerConfirmed > EPS
      ? (perLeadCosts / contributionPerConfirmed) * 100
      : null,
  };
}

function priceVerdict(p: Product, a: AtPrice): PriceVerdict {
  if (a.netProfit < 0) return "LOSS";
  if (a.netMarginPct < p.targetMarginPct - 1e-9) return "BELOW_TARGET";
  return "ON_TARGET";
}

function stackWarnings(p: Product, e: Economics): Warning[] {
  const w: Warning[] = [];
  if (e.breakevenPrice === null) w.push({ code: "STACK_GE_100" });
  else if (e.suggestedPrice === null) w.push({ code: "STACK_PLUS_MARGIN_GE_100" });
  if (p.targetMarginPct < 0) w.push({ code: "NEGATIVE_TARGET_MARGIN" });
  return w;
}

// ─── price_product ──────────────────────────────────────────────────────────

export interface PriceProductResult {
  economics: Economics;
  suggestedPrice: number | null;
  breakevenPrice: number | null;
  costBreakdown: CostItem[];
  atSuggested: AtPrice | null;
  atSellingPrice: AtPrice | null;
  verdict: { code: PriceVerdict; raiseTo: number | null } | null;
  warnings: Warning[];
}

export function priceProduct(p: Product): PriceProductResult {
  const e = economics(p);
  const warnings = stackWarnings(p, e);
  const atSuggested = e.suggestedPrice === null ? null : atPrice(p, e, e.suggestedPrice);
  const sp = p.sellingPrice;
  const atSellingPrice = sp === undefined ? null : atPrice(p, e, sp);

  let verdict: PriceProductResult["verdict"] = null;
  if (atSellingPrice) {
    const code = priceVerdict(p, atSellingPrice);
    verdict = { code, raiseTo: code === "ON_TARGET" ? null : e.suggestedPrice };
    if (e.breakevenPrice !== null && atSellingPrice.price < e.breakevenPrice) {
      warnings.push({ code: "PRICE_BELOW_BREAKEVEN" });
    }
    if (p.leadCpa > atSellingPrice.maxCpaBreakeven) warnings.push({ code: "CPA_ABOVE_MAX" });
    const cr = atSellingPrice.requiredCrPct;
    if (cr === null || cr > 100) warnings.push({ code: "REQUIRED_CR_UNREACHABLE" });
  }

  const pricedAt = sp ?? e.suggestedPrice;
  return {
    economics: e,
    suggestedPrice: e.suggestedPrice,
    breakevenPrice: e.breakevenPrice,
    costBreakdown: [
      { key: "productCost", amount: e.unitProductCost },
      { key: "blendedShipping", amount: e.blendedShipping },
      { key: "operations", amount: e.operationsCost },
      { key: "leadProcessing", amount: e.leadProcessingCost },
      { key: "gatewayFixed", amount: p.paymentGatewayFixed },
      { key: "revenuePctStack", amount: pricedAt === null ? null : pricedAt * e.pctStack },
      { key: "adCostPerDelivered", amount: e.adCostPerDelivered },
    ],
    atSuggested,
    atSellingPrice,
    verdict,
    warnings,
  };
}

// ─── cpa_table ──────────────────────────────────────────────────────────────

export const DEFAULT_MARGINS = [20, 15, 10, 5, 0, -5, -10, -20];

export interface CpaTableResult {
  price: number;
  rows: { marginPct: number; maxCpaPerLead: number; viable: boolean }[];
  headline: {
    maxCpaBreakeven: number;
    maxCpaAtTarget: number;
    currentLeadCpa: number;
    verdict: PriceVerdict;
  };
  warnings: Warning[];
}

export function cpaTable(p: Product, margins: number[] = DEFAULT_MARGINS): CpaTableResult {
  if (p.sellingPrice === undefined) throw new RangeError("cpaTable needs a selling price.");
  const e = economics(p);
  const a = atPrice(p, e, p.sellingPrice);
  return {
    price: p.sellingPrice,
    rows: margins.map((marginPct) => {
      const maxCpaPerLead = maxCpaAt(e, p.sellingPrice!, marginPct);
      // Negative-margin rows lose money by definition (bug #9), so they are never viable.
      return { marginPct, maxCpaPerLead, viable: maxCpaPerLead > 0 && marginPct >= 0 };
    }),
    headline: {
      maxCpaBreakeven: a.maxCpaBreakeven,
      maxCpaAtTarget: a.maxCpaAtTarget,
      currentLeadCpa: p.leadCpa,
      verdict: priceVerdict(p, a),
    },
    warnings: stackWarnings(p, e),
  };
}

// ─── price_bundles ──────────────────────────────────────────────────────────

export interface Tier {
  pieces: number;
  marginPct: number;
  discountPct: number;
}

export interface Offer {
  pieces: number;
  totalPrice: number;
}

export const DEFAULT_TIERS: Tier[] = [
  { pieces: 2, marginPct: 15, discountPct: 5 },
  { pieces: 3, marginPct: 20, discountPct: 10 },
  { pieces: 4, marginPct: 25, discountPct: 15 },
];

export interface TierResult extends Tier {
  price: number | null;
  originalPrice: number | null;
  pricePerPiece: number | null;
  profit: number | null;
  /** Net margin at the tier price (equals the requested margin when the price exists). */
  achievedMarginPct: number | null;
  marginPct: number;
  savingVsSingles: number | null;
}

export interface OfferResult extends Offer {
  pricePerPiece: number;
  profit: number;
  marginPct: number;
  verdict: PriceVerdict;
}

export interface BundlesResult {
  tiers: TierResult[];
  offers: OfferResult[];
  warnings: Warning[];
}

/** Per-order fixed cost of an n-piece order: only product cost scales with pieces. */
const orderFixedCost = (p: Product, e: Economics, n: number) =>
  n * e.unitProductCost + e.blendedShipping + e.operationsCost + p.paymentGatewayFixed +
  e.leadProcessingCost;

/** Net profit of one delivered n-piece order collecting `total`. */
const orderProfit = (p: Product, e: Economics, n: number, total: number) =>
  total * (1 - e.pctStack) - orderFixedCost(p, e, n) - e.adCostPerDelivered;

function offerVerdict(p: Product, profit: number, marginPct: number): PriceVerdict {
  if (profit < 0) return "LOSS";
  return marginPct < p.targetMarginPct - 1e-9 ? "BELOW_TARGET" : "ON_TARGET";
}

export function priceBundles(p: Product, tiers: Tier[], offers: Offer[]): BundlesResult {
  const e = economics(p);
  const warnings = stackWarnings(p, e);
  const bundleFixed = (n: number) => orderFixedCost(p, e, n);
  const profitAt = (n: number, total: number) => orderProfit(p, e, n, total);

  const tierResults = tiers.map((t): TierResult => {
    const denom = 1 - e.pctStack - t.marginPct / 100;
    if (denom <= EPS) {
      warnings.push({ code: "STACK_PLUS_MARGIN_GE_100", detail: { pieces: t.pieces } });
      return {
        ...t,
        price: null,
        originalPrice: null,
        pricePerPiece: null,
        profit: null,
        achievedMarginPct: null,
        savingVsSingles: null,
      };
    }
    const price = (bundleFixed(t.pieces) + e.adCostPerDelivered) / denom;
    const profit = profitAt(t.pieces, price);
    return {
      ...t,
      price,
      originalPrice: t.discountPct > 0 && t.discountPct < 100
        ? price / (1 - t.discountPct / 100)
        : price,
      pricePerPiece: price / t.pieces,
      profit,
      achievedMarginPct: (profit / price) * 100,
      savingVsSingles: p.sellingPrice === undefined ? null : t.pieces * p.sellingPrice - price,
    };
  });

  const offerResults = offers.map((o): OfferResult => {
    const profit = profitAt(o.pieces, o.totalPrice);
    const marginPct = (profit / o.totalPrice) * 100;
    if (profit < 0) {
      warnings.push({ code: "OFFER_BELOW_BREAKEVEN", detail: { pieces: o.pieces } });
    }
    const verdict = offerVerdict(p, profit, marginPct);
    return { ...o, pricePerPiece: o.totalPrice / o.pieces, profit, marginPct, verdict };
  });

  return { tiers: tierResults, offers: offerResults, warnings };
}

// ─── compare_prices ─────────────────────────────────────────────────────────

export interface Competitor {
  label: string;
  /** What the customer pays for the offer, before any separate shipping charge. */
  totalPrice: number;
  pieces: number;
  /** Shipping the customer pays on top of totalPrice (0 when "free shipping"). */
  shippingCharged: number;
  source?: string;
  seenOn?: string;
}

export type MarketPosition = "BELOW_BAND" | "IN_BAND" | "ABOVE_BAND";
export type RecommendationCode =
  | "PRICE_IN_BAND"
  | "PREMIUM_ONLY"
  | "CANNOT_COMPETE_ON_PRICE"
  | "NO_PROFITABLE_PRICE";

export interface CompareResult {
  competitors: (Competitor & {
    pricePerPiece: number;
    ifMatched: {
      profit: number;
      marginPct: number;
      maxCpaBreakeven: number;
      verdict: PriceVerdict;
    };
  })[];
  market: { count: number; min: number; p25: number; median: number; p75: number; max: number };
  breakevenPrice: number | null;
  suggestedPrice: number | null;
  /** Recommended single-piece price band; null bounds when no band exists. */
  recommendation: { code: RecommendationCode; low: number | null; high: number | null };
  seller: { price: number; shareCheaperPct: number; position: MarketPosition | null } | null;
  warnings: Warning[];
}

/** Linear-interpolated percentile of a non-empty list. */
function percentile(values: number[], q: number): number {
  const xs = [...values].sort((a, b) => a - b);
  const k = (xs.length - 1) * q;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, xs.length - 1);
  return xs[lo] + (xs[hi] - xs[lo]) * (k - lo);
}

export function comparePrices(p: Product, competitors: Competitor[]): CompareResult {
  if (competitors.length === 0) {
    throw new RangeError("comparePrices needs at least one competitor.");
  }
  const e = economics(p);
  const warnings = stackWarnings(p, e);
  if (competitors.length < 3) warnings.push({ code: "FEW_COMPETITORS" });

  const rows = competitors.map((c) => {
    const total = c.totalPrice + c.shippingCharged;
    const profit = orderProfit(p, e, c.pieces, total);
    const marginPct = (profit / total) * 100;
    return {
      ...c,
      pricePerPiece: total / c.pieces,
      ifMatched: {
        profit,
        marginPct,
        // Max CPA per lead that keeps this matched offer at breakeven.
        maxCpaBreakeven: (total * (1 - e.pctStack) - orderFixedCost(p, e, c.pieces)) *
          e.successRatePct / 100,
        verdict: offerVerdict(p, profit, marginPct),
      },
    };
  });

  const prices = rows.map((r) => r.pricePerPiece);
  const market = {
    count: prices.length,
    min: Math.min(...prices),
    p25: percentile(prices, 0.25),
    median: percentile(prices, 0.5),
    p75: percentile(prices, 0.75),
    max: Math.max(...prices),
  };

  const sug = e.suggestedPrice;
  let recommendation: CompareResult["recommendation"];
  if (sug === null) {
    recommendation = { code: "NO_PROFITABLE_PRICE", low: null, high: null };
  } else if (sug > market.max) {
    recommendation = { code: "CANNOT_COMPETE_ON_PRICE", low: null, high: null };
  } else if (Math.max(sug, market.p25) <= market.median) {
    recommendation = { code: "PRICE_IN_BAND", low: Math.max(sug, market.p25), high: market.median };
  } else {
    recommendation = { code: "PREMIUM_ONLY", low: sug, high: market.max };
  }

  let seller: CompareResult["seller"] = null;
  if (p.sellingPrice !== undefined) {
    const sp = p.sellingPrice;
    const { low, high } = recommendation;
    seller = {
      price: sp,
      shareCheaperPct: (prices.filter((x) => x < sp).length / prices.length) * 100,
      // No band (cannot compete / no profitable price) → no position.
      position: low === null || high === null
        ? null
        : sp < low
        ? "BELOW_BAND"
        : sp > high
        ? "ABOVE_BAND"
        : "IN_BAND",
    };
  }

  return {
    competitors: rows,
    market,
    breakevenPrice: e.breakevenPrice,
    suggestedPrice: sug,
    recommendation,
    seller,
    warnings,
  };
}

// ─── check_campaign ─────────────────────────────────────────────────────────

export interface Campaign {
  adBudgetSpent: number;
  leads: number;
  confirmed: number;
  delivered: number;
}

export type CampaignCostKey =
  | "productCosts"
  | "shippingCosts"
  | "packaging"
  | "fulfillment"
  | "callCenter"
  | "sms"
  | "gatewayFixed"
  | "gatewayPct"
  | "platformFees"
  | "marketerFees"
  | "vat";

export interface Lever {
  lever: "price" | "cpl";
  current: number;
  target: number;
  /** Relative change needed, in percent of the current value. */
  changePct: number;
  feasible: boolean;
}

export interface CampaignResult {
  revenue: number;
  costBreakdown: { key: CampaignCostKey; amount: number }[];
  totalCosts: number;
  contributionBeforeAds: number;
  netProfit: number;
  netMarginPct: number | null;
  cpl: number | null;
  actualCpaPerDelivered: number | null;
  roas: number | null;
  breakEvenRoas: number | null;
  crPct: number | null;
  drPct: number | null;
  rtoCount: number;
  maxCplBreakeven: number | null;
  maxCplAtTarget: number | null;
  requiredPrice: number | null;
  breakevenPrice: number | null;
  verdict: CampaignVerdict | null;
  levers: Lever[];
  warnings: Warning[];
}

export function checkCampaign(p: Product, c: Campaign): CampaignResult {
  if (p.sellingPrice === undefined) throw new RangeError("checkCampaign needs a selling price.");
  const price = p.sellingPrice;
  const unit = p.productCost + p.customsDutyPerUnit;
  const stack = (p.vatPct + p.platformFeePct + p.marketerCommissionPct + p.paymentGatewayPct) /
    100;
  const tm = p.targetMarginPct / 100;
  const warnings: Warning[] = [];
  if (c.delivered > c.confirmed || c.confirmed > c.leads) {
    warnings.push({ code: "COUNTS_INCONSISTENT" });
  }
  if (c.delivered === 0) warnings.push({ code: "NO_DELIVERIES" });
  if (c.adBudgetSpent === 0) warnings.push({ code: "NO_AD_BUDGET" });
  if (stack >= 1) warnings.push({ code: "STACK_GE_100" });
  else if (stack + tm >= 1) warnings.push({ code: "STACK_PLUS_MARGIN_GE_100" });
  if (tm < 0) warnings.push({ code: "NEGATIVE_TARGET_MARGIN" });

  const rtoCount = Math.max(0, c.confirmed - c.delivered);
  const revenue = c.delivered * price;
  const fixedParts = {
    productCosts: c.delivered * unit,
    shippingCosts: c.delivered * p.deliveryFee + rtoCount * p.returnShippingFee,
    packaging: c.confirmed * p.packagingCost,
    fulfillment: c.confirmed * p.fulfillmentFee,
    callCenter: c.leads * p.callCenterCostPerLead,
    sms: c.leads * p.smsCostPerLead,
    gatewayFixed: c.confirmed * p.paymentGatewayFixed,
  };
  const pctParts = {
    gatewayPct: revenue * p.paymentGatewayPct / 100,
    platformFees: revenue * p.platformFeePct / 100,
    marketerFees: revenue * p.marketerCommissionPct / 100,
    vat: revenue * p.vatPct / 100,
  };
  const nonPct = Object.values(fixedParts).reduce((a, b) => a + b, 0);
  const totalCosts = nonPct + revenue * stack;
  const contributionBeforeAds = revenue - totalCosts;
  const netProfit = contributionBeforeAds - c.adBudgetSpent;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : null;
  const cpl = c.leads > 0 ? c.adBudgetSpent / c.leads : null;
  const maxCplAtTarget = c.leads > 0 ? (revenue * (1 - tm) - totalCosts) / c.leads : null;
  const requiredPrice = c.delivered > 0 && 1 - stack - tm > EPS
    ? (nonPct + c.adBudgetSpent) / (c.delivered * (1 - stack - tm))
    : null;

  let verdict: CampaignVerdict | null = null;
  if (c.delivered > 0 || c.adBudgetSpent > 0) {
    if (netProfit < 0) verdict = "PAUSE";
    else if (netMarginPct === null || netMarginPct < p.targetMarginPct - 1e-9) verdict = "FIX";
    else verdict = "SCALE";
  }

  const levers: Lever[] = [];
  if (verdict === "PAUSE" || verdict === "FIX") {
    if (requiredPrice !== null && price < requiredPrice) {
      levers.push({
        lever: "price",
        current: price,
        target: requiredPrice,
        changePct: ((requiredPrice - price) / price) * 100,
        feasible: true,
      });
    }
    if (cpl !== null && maxCplAtTarget !== null && cpl > maxCplAtTarget) {
      levers.push({
        lever: "cpl",
        current: cpl,
        target: maxCplAtTarget,
        changePct: cpl > 0 ? ((maxCplAtTarget - cpl) / cpl) * 100 : 0,
        feasible: maxCplAtTarget > 0,
      });
    }
    // Feasible levers first, then the smallest relative change.
    levers.sort((a, b) =>
      Number(b.feasible) - Number(a.feasible) || Math.abs(a.changePct) - Math.abs(b.changePct)
    );
  }

  return {
    revenue,
    costBreakdown: (Object.entries({ ...fixedParts, ...pctParts }) as [CampaignCostKey, number][])
      .map(([key, amount]) => ({ key, amount })),
    totalCosts,
    contributionBeforeAds,
    netProfit,
    netMarginPct,
    cpl,
    actualCpaPerDelivered: c.delivered > 0 ? c.adBudgetSpent / c.delivered : null,
    roas: c.adBudgetSpent > 0 ? revenue / c.adBudgetSpent : null,
    breakEvenRoas: contributionBeforeAds > EPS ? revenue / contributionBeforeAds : null,
    crPct: c.leads > 0 ? (c.confirmed / c.leads) * 100 : null,
    drPct: c.confirmed > 0 ? (c.delivered / c.confirmed) * 100 : null,
    rtoCount,
    maxCplBreakeven: c.leads > 0 ? contributionBeforeAds / c.leads : null,
    maxCplAtTarget,
    requiredPrice,
    breakevenPrice: c.delivered > 0 && 1 - stack > EPS
      ? (nonPct + c.adBudgetSpent) / (c.delivered * (1 - stack))
      : null,
    verdict,
    levers,
    warnings,
  };
}

// ─── price_scenarios ────────────────────────────────────────────────────────
// One table for a seller who is new to this: every price worth considering, what each earns,
// and how healthy it is — with competitors in the same rows (specs/beginner-pricing.md).

export interface ScenarioCompetitor {
  label: string;
  price: number;
  source?: string;
}

export type ScenarioBand = "LOSS" | "CRITICAL" | "THIN" | "HEALTHY";
export type ScenarioKind = "breakeven" | "suggested" | "you" | "competitor" | "ladder";

export interface ScenarioRow {
  price: number;
  who: string;
  kind: ScenarioKind;
  profitPerOrder: number;
  marginPct: number;
  /** Volume columns at the assumed ad spend; null when ads cost nothing, so volume is undefined. */
  deliveredOrders: number | null;
  revenue: number | null;
  profit: number | null;
  band: ScenarioBand;
  source?: string;
}

export interface ScenariosResult {
  adSpendAssumed: number;
  deliveredPerSpend: number | null;
  breakevenPrice: number | null;
  suggestedPrice: number | null;
  rows: ScenarioRow[];
  warnings: Warning[];
}

/** A margin below this is "critical" however low the seller's own target is. */
export const CRITICAL_MARGIN_PCT = 5;
export const DEFAULT_SCENARIO_AD_SPEND = 1000;
const MAX_SCENARIO_ROWS = 12;
/** Steps around the safe price, so the seller sees what a small change is worth. */
const LADDER_STEPS = [-0.2, -0.1, 0.1, 0.2];

function scenarioBand(p: Product, profit: number, marginPct: number): ScenarioBand {
  // Exactly breakeven lands a hair below zero in floating point; that is not a loss.
  if (profit < -1e-9) return "LOSS";
  if (marginPct < CRITICAL_MARGIN_PCT) return "CRITICAL";
  if (marginPct < p.targetMarginPct - 1e-9) return "THIN";
  return "HEALTHY";
}

export function priceScenarios(
  p: Product,
  competitors: ScenarioCompetitor[] = [],
  adSpend: number = DEFAULT_SCENARIO_AD_SPEND,
): ScenariosResult {
  const e = economics(p);
  const warnings = stackWarnings(p, e);

  // Candidates are derived here, never chosen by the caller's model.
  const candidates: { price: number; who: string; kind: ScenarioKind; source?: string }[] = [];
  const add = (price: number, who: string, kind: ScenarioKind, source?: string) => {
    if (!Number.isFinite(price) || price <= 0) return;
    candidates.push({ price, who, kind, source });
  };
  if (e.breakevenPrice !== null) add(e.breakevenPrice, "breakeven", "breakeven");
  if (e.suggestedPrice !== null) {
    add(e.suggestedPrice, "suggested", "suggested");
    for (const step of LADDER_STEPS) add(e.suggestedPrice * (1 + step), "option", "ladder");
  }
  if (p.sellingPrice !== undefined) add(p.sellingPrice, "you", "you");
  for (const c of competitors) add(c.price, c.label, "competitor", c.source);

  // Sort, then keep the first row for each price so a named anchor wins over a ladder step.
  const rank: Record<ScenarioKind, number> = {
    you: 0,
    competitor: 1,
    suggested: 2,
    breakeven: 3,
    ladder: 4,
  };
  candidates.sort((a, b) => a.price - b.price || rank[a.kind] - rank[b.kind]);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    const prev = picked[picked.length - 1];
    if (prev && Math.abs(prev.price - c.price) < 1e-9) continue;
    picked.push(c);
  }
  // If there are more prices than a table should hold, drop ladder steps first.
  while (picked.length > MAX_SCENARIO_ROWS) {
    const i = picked.map((c) => c.kind).lastIndexOf("ladder");
    if (i < 0) break;
    picked.splice(i, 1);
  }

  const deliveredPerSpend = e.adCostPerDelivered > EPS ? adSpend / e.adCostPerDelivered : null;
  if (deliveredPerSpend === null) warnings.push({ code: "VOLUME_UNDEFINED" });

  const rows: ScenarioRow[] = picked.map((c) => {
    const profitPerOrder = c.price * (1 - e.pctStack) - e.fixedCostsPerDelivered -
      e.adCostPerDelivered;
    const marginPct = (profitPerOrder / c.price) * 100;
    return {
      price: c.price,
      who: c.who,
      kind: c.kind,
      profitPerOrder,
      marginPct,
      deliveredOrders: deliveredPerSpend,
      revenue: deliveredPerSpend === null ? null : c.price * deliveredPerSpend,
      profit: deliveredPerSpend === null ? null : profitPerOrder * deliveredPerSpend,
      band: scenarioBand(p, profitPerOrder, marginPct),
      ...(c.source ? { source: c.source } : {}),
    };
  });

  return {
    adSpendAssumed: adSpend,
    deliveredPerSpend,
    breakevenPrice: e.breakevenPrice,
    suggestedPrice: e.suggestedPrice,
    rows,
    warnings,
  };
}
