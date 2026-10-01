/**
 * Parity port of the original Flutter app's pricing engine.
 *
 * This module reproduces the original app's current behaviour on purpose, including its known bugs
 * (CLAUDE.md §6). It exists only so the golden tests can prove the port is faithful.
 * The MCP tools use engine/canonical.ts instead. Do not "fix" anything here.
 */

export interface PricingVariables {
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
  sellingPrice: number;
  bundleMarginPct2pc: number;
  bundleMarginPct3pc: number;
  bundleMarginPct4pc: number;
  bundleDiscountPct2pc: number;
  bundleDiscountPct3pc: number;
  bundleDiscountPct4pc: number;
  adSpend: number;
  totalLeads: number;
  confirmedOrders: number;
  deliveredOrders: number;
}

export interface ExchangeRate {
  usdToBase: number;
  localToBase: number;
}

/** The rates golden.json was generated with (local currency = EGP). */
export const GOLDEN_RATES: ExchangeRate = { usdToBase: 50, localToBase: 1 };

export interface CpaMatrixRow {
  marginPct: number;
  cpaLocal: number;
  cpaEgp: number;
  cpaUsd: number;
  isViable: boolean;
}

export interface BundlePricingResult {
  pieces: number;
  pricePerPiece: number;
  totalPrice: number;
  originalTotalPrice: number;
  marginPct: number;
  discountPct: number;
  profitPerBundle: number;
}

export interface CostBreakdownItem {
  label: string;
  amount: number;
}

export interface PricingResults {
  totalCostPerUnit: number;
  suggestedPrice: number;
  breakevenPrice: number;
  netProfit: number;
  netMarginPct: number;
  grossProfit: number;
  maxCpa: number;
  breakEvenRoas: number;
  roas: number;
  /** Already multiplied by 100, as in the original app. */
  successRate: number;
  leadsPerDelivered: number;
  adCostPerDelivered: number;
  blendedShipping: number;
  operationsCost: number;
  leadProcessingCost: number;
  fixedCostsPerDelivered: number;
  pctStack: number;
  cpaMatrixRows: CpaMatrixRow[];
  bundles: BundlePricingResult[];
  revenue: number;
  totalCogs: number;
  actualCpa: number;
  cpl: number;
  crPct: number;
  drPct: number;
  cogsBreakdown: CostBreakdownItem[];
  requiredPrice: number;
  requiredCr: number;
  breakevenMaxCpa: number;
  survivalCr: number;
  expectedPnl: number;
  targetPnl: number;
  breakevenPnl: number;
  rtoCount: number;
}

const EMPTY_RESULTS: PricingResults = {
  totalCostPerUnit: 0,
  suggestedPrice: 0,
  breakevenPrice: 0,
  netProfit: 0,
  netMarginPct: 0,
  grossProfit: 0,
  maxCpa: 0,
  breakEvenRoas: 0,
  roas: 0,
  successRate: 0,
  leadsPerDelivered: 0,
  adCostPerDelivered: 0,
  blendedShipping: 0,
  operationsCost: 0,
  leadProcessingCost: 0,
  fixedCostsPerDelivered: 0,
  pctStack: 0,
  cpaMatrixRows: [],
  bundles: [],
  revenue: 0,
  totalCogs: 0,
  actualCpa: 0,
  cpl: 0,
  crPct: 0,
  drPct: 0,
  cogsBreakdown: [],
  requiredPrice: 0,
  requiredCr: 0,
  breakevenMaxCpa: 0,
  survivalCr: 0,
  expectedPnl: 0,
  targetPnl: 0,
  breakevenPnl: 0,
  rtoCount: 0,
};

const results = (r: Partial<PricingResults>): PricingResults => ({ ...EMPTY_RESULTS, ...r });

const pct = (v: number) => Math.min(Math.max(v / 100, 0), 1);

const localToEgp = (rates: ExchangeRate, local: number) =>
  rates.localToBase !== 0 ? local / rates.localToBase : 0;
const egpToUsd = (rates: ExchangeRate, egp: number) =>
  rates.usdToBase !== 0 ? egp / rates.usdToBase : 0;

interface Funnel {
  crFrac: number;
  drFrac: number;
  successRate: number;
  leadsPerDelivered: number;
}

function funnel(v: PricingVariables): Funnel {
  const crFrac = pct(v.confirmationRatePct);
  const drFrac = pct(v.deliveryRatePct);
  const successRate = crFrac * drFrac;
  return {
    crFrac,
    drFrac,
    successRate,
    leadsPerDelivered: successRate > 0 ? 1 / successRate : 0,
  };
}

const blended = (v: PricingVariables, drFrac: number) =>
  v.deliveryFee * drFrac + v.returnShippingFee * (1 - drFrac);

const fullStack = (v: PricingVariables) =>
  v.vatPct / 100 + v.platformFeePct / 100 + v.marketerCommissionPct / 100 +
  v.paymentGatewayPct / 100;

/** Comprehensive fixed costs used for "display" metrics in several modes. */
function comprehensive(v: PricingVariables, f: Funnel) {
  const blendedShipping = blended(v, f.drFrac);
  const opsCost = v.packagingCost + v.fulfillmentFee;
  const leadProcessingCost = f.leadsPerDelivered * (v.callCenterCostPerLead + v.smsCostPerLead);
  const fixedCosts = v.productCost + v.customsDutyPerUnit + blendedShipping + opsCost +
    v.paymentGatewayFixed + leadProcessingCost;
  const pctStack = fullStack(v);
  const adCostPerDelivered = v.leadCpa * f.leadsPerDelivered;
  const tm = v.targetMarginPct / 100;
  const breakevenPrice = pctStack < 1 ? (fixedCosts + adCostPerDelivered) / (1 - pctStack) : 0;
  const suggestedPrice = pctStack + tm < 1
    ? (fixedCosts + adCostPerDelivered) / (1 - pctStack - tm)
    : 0;
  return {
    blendedShipping,
    opsCost,
    leadProcessingCost,
    fixedCosts,
    pctStack,
    adCostPerDelivered,
    breakevenPrice,
    suggestedPrice,
  };
}

// ─── CPA Matrix (Tab #1) ────────────────────────────────────────────────────

export function calculateCpaMatrix(
  v: PricingVariables,
  rates: ExchangeRate = GOLDEN_RATES,
): PricingResults {
  const f = funnel(v);
  const c = comprehensive(v, f);

  // Simple formula: no customs, delivery fee instead of blended shipping.
  const cost = v.productCost;
  const ship = v.deliveryFee;
  const basePrice = v.sellingPrice > 0
    ? v.sellingPrice
    : (cost + ship + c.adCostPerDelivered) / (1 - v.targetMarginPct / 100);
  const grossProfit = basePrice - cost - ship;

  const cpaMatrixRows = [20, 15, 10, 5, 0, -5, -10, -20].map((marginPct): CpaMatrixRow => {
    const cpaLocal = (grossProfit - basePrice * (marginPct / 100)) * f.successRate;
    const cpaEgp = localToEgp(rates, cpaLocal);
    return {
      marginPct,
      cpaLocal,
      cpaEgp,
      cpaUsd: egpToUsd(rates, cpaEgp),
      isViable: cpaLocal > 0,
    };
  });

  // Headline metrics use the comprehensive model at the suggested price (bug #4).
  const comprehensiveGrossProfit = c.suggestedPrice * (1 - c.pctStack) - c.fixedCosts;
  const netProfit = comprehensiveGrossProfit - c.adCostPerDelivered;

  return results({
    totalCostPerUnit: c.fixedCosts + c.adCostPerDelivered,
    suggestedPrice: c.suggestedPrice,
    breakevenPrice: c.breakevenPrice,
    netProfit,
    netMarginPct: c.suggestedPrice > 0 ? (netProfit / c.suggestedPrice) * 100 : 0,
    grossProfit: comprehensiveGrossProfit,
    maxCpa: f.leadsPerDelivered > 0 ? comprehensiveGrossProfit / f.leadsPerDelivered : 0,
    breakEvenRoas: comprehensiveGrossProfit > 0 ? c.suggestedPrice / comprehensiveGrossProfit : 0,
    successRate: f.successRate * 100,
    leadsPerDelivered: f.leadsPerDelivered,
    adCostPerDelivered: c.adCostPerDelivered,
    blendedShipping: c.blendedShipping,
    operationsCost: c.opsCost,
    leadProcessingCost: c.leadProcessingCost,
    fixedCostsPerDelivered: c.fixedCosts,
    pctStack: c.pctStack,
    cpaMatrixRows,
  });
}

// ─── Reverse KPI (Tab #2) ───────────────────────────────────────────────────

export function calculateReverseKpi(v: PricingVariables): PricingResults {
  const f = funnel(v);
  const c = comprehensive(v, f);

  const cost = v.productCost;
  const ship = v.deliveryFee;
  const tm = v.targetMarginPct / 100;
  const requiredPrice = tm < 1 ? (cost + ship + c.adCostPerDelivered) / (1 - tm) : 0;
  const grossProfit = v.sellingPrice - cost - ship;
  const allowable = v.sellingPrice * (1 - tm) - cost - ship;
  const maxCpa = grossProfit * f.successRate;
  const requiredCr = allowable > 0 && f.drFrac > 0 ? ((v.leadCpa / allowable) / f.drFrac) * 100 : 0;
  const breakevenMaxCpa = f.leadsPerDelivered > 0 ? grossProfit / f.leadsPerDelivered : 0;
  const survivalCr = v.sellingPrice > 0 && v.leadCpa > 0
    ? (cost + ship) / (v.sellingPrice - v.leadCpa) * 100
    : 0;
  const netProfit = grossProfit - c.adCostPerDelivered;

  return results({
    totalCostPerUnit: c.fixedCosts + c.adCostPerDelivered,
    suggestedPrice: c.suggestedPrice,
    breakevenPrice: c.breakevenPrice,
    netProfit,
    netMarginPct: v.sellingPrice > 0 ? (netProfit / v.sellingPrice) * 100 : 0,
    grossProfit,
    maxCpa,
    breakEvenRoas: grossProfit > 0 ? v.sellingPrice / grossProfit : 0,
    successRate: f.successRate * 100,
    leadsPerDelivered: f.leadsPerDelivered,
    adCostPerDelivered: c.adCostPerDelivered,
    blendedShipping: c.blendedShipping,
    operationsCost: c.opsCost,
    leadProcessingCost: c.leadProcessingCost,
    fixedCostsPerDelivered: c.fixedCosts,
    pctStack: c.pctStack,
    // Bug #5: the Dart comment says "blendedShipping" but the call passes deliveryFee.
    bundles: bundlesSimple(cost, ship, v.sellingPrice, v.leadCpa, f.successRate),
    requiredPrice,
    requiredCr,
    breakevenMaxCpa,
    survivalCr,
  });
}

// ─── Advanced P&L (Tab #3) ──────────────────────────────────────────────────

export function calculateAdvancedPnl(v: PricingVariables): PricingResults {
  const f = funnel(v);
  const adCostPerDel = f.successRate > 0 ? v.leadCpa / f.successRate : 0;
  const fulCostPerDel = f.drFrac > 0 ? v.fulfillmentFee * (1 / f.drFrac) : 0;
  const returnCostPerDel = f.drFrac > 0 ? v.returnShippingFee * (1 / f.drFrac - 1) : 0;
  const baseCost = v.productCost + adCostPerDel + v.deliveryFee + returnCostPerDel +
    fulCostPerDel;

  // Only VAT + marketer (bug #3).
  const pctStack = v.vatPct / 100 + v.marketerCommissionPct / 100;
  const tm = v.targetMarginPct / 100;
  const breakevenPrice = pctStack < 1 ? baseCost / (1 - pctStack) : 0;
  const suggestedPrice = pctStack + tm < 1 ? baseCost / (1 - pctStack - tm) : 0;
  const price = v.sellingPrice > 0 ? v.sellingPrice : suggestedPrice;

  const expectedPnl = price * (1 - pctStack) - baseCost;
  const targetPnl = suggestedPrice * (1 - pctStack) - baseCost;
  const breakevenPnl = breakevenPrice * (1 - pctStack) - baseCost;
  const grossProfit = price * (1 - pctStack) - baseCost + adCostPerDel;

  return results({
    totalCostPerUnit: baseCost,
    suggestedPrice,
    breakevenPrice,
    netProfit: expectedPnl,
    netMarginPct: price > 0 ? (expectedPnl / price) * 100 : 0,
    grossProfit,
    maxCpa: f.leadsPerDelivered > 0 ? grossProfit / f.leadsPerDelivered : 0,
    breakEvenRoas: grossProfit > 0 ? price / grossProfit : 0,
    successRate: f.successRate * 100,
    leadsPerDelivered: f.leadsPerDelivered,
    adCostPerDelivered: adCostPerDel,
    blendedShipping: blended(v, f.drFrac),
    operationsCost: v.packagingCost + v.fulfillmentFee,
    leadProcessingCost: f.leadsPerDelivered * (v.callCenterCostPerLead + v.smsCostPerLead),
    fixedCostsPerDelivered: baseCost - adCostPerDel,
    pctStack,
    bundles: bundlesAdvPnl(v, adCostPerDel, returnCostPerDel, fulCostPerDel, pctStack),
    expectedPnl,
    targetPnl,
    breakevenPnl,
  });
}

// ─── Ultimate Pricing (Tab #4) ──────────────────────────────────────────────

export function calculateUltimatePricing(v: PricingVariables): PricingResults {
  const f = funnel(v);
  const c = comprehensive(v, f);
  // Bug #1: profit is always evaluated at the suggested price, never at sellingPrice.
  const grossProfit = c.suggestedPrice * (1 - c.pctStack) - c.fixedCosts;
  const netProfit = grossProfit - c.adCostPerDelivered;
  const unitProductCost = v.productCost + v.customsDutyPerUnit;

  return results({
    totalCostPerUnit: c.fixedCosts + c.adCostPerDelivered,
    suggestedPrice: c.suggestedPrice,
    breakevenPrice: c.breakevenPrice,
    netProfit,
    netMarginPct: c.suggestedPrice > 0 ? (netProfit / c.suggestedPrice) * 100 : 0,
    grossProfit,
    maxCpa: f.leadsPerDelivered > 0 ? grossProfit / f.leadsPerDelivered : 0,
    breakEvenRoas: grossProfit > 0 ? c.suggestedPrice / grossProfit : 0,
    successRate: f.successRate * 100,
    leadsPerDelivered: f.leadsPerDelivered,
    adCostPerDelivered: c.adCostPerDelivered,
    blendedShipping: c.blendedShipping,
    operationsCost: c.opsCost,
    leadProcessingCost: c.leadProcessingCost,
    fixedCostsPerDelivered: c.fixedCosts,
    pctStack: c.pctStack,
    bundles: bundlesUltimate(v, unitProductCost, c),
    cogsBreakdown: [
      { label: "Product Cost", amount: unitProductCost },
      { label: "Blended Shipping", amount: c.blendedShipping },
      { label: "Operations", amount: c.opsCost },
      { label: "Lead Processing", amount: c.leadProcessingCost },
      { label: "Gateway Fixed", amount: v.paymentGatewayFixed },
      { label: "Revenue % Stack", amount: c.suggestedPrice * c.pctStack },
      { label: "Ad Cost/Delivered", amount: c.adCostPerDelivered },
    ],
  });
}

// ─── P&L Tracker (Tab #5) ───────────────────────────────────────────────────

export function calculatePlTracker(v: PricingVariables): PricingResults {
  // Success rate comes from the *input* CR/DR, not from the campaign counts (trap T9).
  const f = funnel(v);
  const unitProductCost = v.productCost + v.customsDutyPerUnit;
  const rtoCount = Math.max(0, v.confirmedOrders - v.deliveredOrders);

  const revenue = v.deliveredOrders * v.sellingPrice;
  const productCosts = v.deliveredOrders * unitProductCost;
  const shippingCosts = v.deliveredOrders * v.deliveryFee + rtoCount * v.returnShippingFee;
  const packagingCosts = v.confirmedOrders * v.packagingCost;
  const fulfillmentCosts = v.confirmedOrders * v.fulfillmentFee;
  const callCenterCosts = v.totalLeads * v.callCenterCostPerLead;
  const smsCosts = v.totalLeads * v.smsCostPerLead;
  const gatewayFees = revenue * v.paymentGatewayPct / 100 +
    v.confirmedOrders * v.paymentGatewayFixed;
  const platformFees = revenue * v.platformFeePct / 100;
  const marketerFees = revenue * v.marketerCommissionPct / 100;
  const vatFees = revenue * v.vatPct / 100;

  const totalCogs = productCosts + shippingCosts + packagingCosts + fulfillmentCosts +
    callCenterCosts + smsCosts + gatewayFees + platformFees + marketerFees + vatFees;
  const netProfit = revenue - totalCogs - v.adSpend;
  const fixedCostsPerDelivered = v.deliveredOrders > 0 ? totalCogs / v.deliveredOrders : 0;
  const contribBeforeAds = revenue - totalCogs;
  const actualCpa = v.deliveredOrders > 0 ? v.adSpend / v.deliveredOrders : 0;

  return results({
    totalCostPerUnit: fixedCostsPerDelivered,
    suggestedPrice: v.sellingPrice,
    breakevenPrice: 0,
    netProfit,
    netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    // Bug #6: gross profit only subtracts product costs.
    grossProfit: revenue - productCosts,
    maxCpa: 0,
    breakEvenRoas: contribBeforeAds > 0 && revenue > 0 ? revenue / contribBeforeAds : 0,
    roas: v.adSpend > 0 ? revenue / v.adSpend : 0,
    successRate: f.successRate * 100,
    leadsPerDelivered: f.leadsPerDelivered,
    adCostPerDelivered: actualCpa,
    blendedShipping: blended(v, f.drFrac),
    operationsCost: v.packagingCost + v.fulfillmentFee,
    leadProcessingCost: f.leadsPerDelivered * (v.callCenterCostPerLead + v.smsCostPerLead),
    fixedCostsPerDelivered,
    pctStack: fullStack(v),
    revenue,
    totalCogs,
    actualCpa,
    cpl: v.totalLeads > 0 ? v.adSpend / v.totalLeads : 0,
    crPct: v.totalLeads > 0 ? (v.confirmedOrders / v.totalLeads) * 100 : 0,
    drPct: v.confirmedOrders > 0 ? (v.deliveredOrders / v.confirmedOrders) * 100 : 0,
    rtoCount,
    cogsBreakdown: [
      { label: "Product Costs", amount: productCosts },
      { label: "Shipping Costs", amount: shippingCosts },
      { label: "Packaging", amount: packagingCosts },
      { label: "Fulfillment", amount: fulfillmentCosts },
      { label: "Call Center", amount: callCenterCosts },
      { label: "SMS", amount: smsCosts },
      { label: "Gateway Fees", amount: gatewayFees },
      { label: "Platform Fees", amount: platformFees },
      { label: "Marketer Fees", amount: marketerFees },
      { label: "VAT", amount: vatFees },
    ],
  });
}

// ─── Bundle helpers ─────────────────────────────────────────────────────────

const bundleConfigs = (v: PricingVariables): [number, number, number][] => [
  [2, v.bundleMarginPct2pc, v.bundleDiscountPct2pc],
  [3, v.bundleMarginPct3pc, v.bundleDiscountPct3pc],
  [4, v.bundleMarginPct4pc, v.bundleDiscountPct4pc],
];

const originalFrom = (price: number, discountPct: number) =>
  discountPct > 0 && discountPct < 100 ? price / (1 - discountPct / 100) : price;

function bundlesAdvPnl(
  v: PricingVariables,
  adCostPerDel: number,
  returnCostPerDel: number,
  fulCostPerDel: number,
  pctStack: number,
): BundlePricingResult[] {
  return bundleConfigs(v).map(([pieces, marginPct, discountPct]) => {
    const baseCost = v.productCost * pieces + adCostPerDel + v.deliveryFee + returnCostPerDel +
      fulCostPerDel;
    const divisor = 1 - marginPct / 100 - pctStack;
    const price = divisor > 0 ? baseCost / divisor : 0;
    const netProfit = price * (1 - pctStack) - baseCost;
    return {
      pieces,
      pricePerPiece: price / pieces,
      totalPrice: price,
      originalTotalPrice: originalFrom(price, discountPct),
      marginPct: price > 0 ? (netProfit / price) * 100 : 0,
      discountPct,
      profitPerBundle: netProfit,
    };
  });
}

function bundlesSimple(
  cost: number,
  ship: number,
  price: number,
  cpa: number,
  successRate: number,
): BundlePricingResult[] {
  const out: BundlePricingResult[] = [];
  for (const n of [2, 3, 4]) {
    const bundleCost = cost * n + ship;
    const fullPrice = price * n;
    for (const d of [0, 10, 20, 30, 40, 50]) {
      const discounted = fullPrice * (1 - d / 100);
      const bundleAdCost = successRate > 0 ? cpa / successRate : 0;
      const netProfit = discounted - bundleCost - bundleAdCost;
      out.push({
        pieces: n,
        pricePerPiece: discounted / n,
        totalPrice: discounted,
        originalTotalPrice: fullPrice,
        marginPct: discounted > 0 ? (netProfit / discounted) * 100 : 0,
        discountPct: d,
        profitPerBundle: netProfit,
      });
    }
  }
  return out;
}

function bundlesUltimate(
  v: PricingVariables,
  unitProductCost: number,
  c: ReturnType<typeof comprehensive>,
): BundlePricingResult[] {
  return bundleConfigs(v).map(([pieces, marginPct, discountPct]) => {
    // Only product cost scales with pieces; per-order costs are shared.
    const bundleFixed = pieces * unitProductCost + c.blendedShipping + c.opsCost +
      v.paymentGatewayFixed + c.leadProcessingCost;
    const denom = 1 - c.pctStack - marginPct / 100;
    const price = denom > 0 ? (bundleFixed + c.adCostPerDelivered) / denom : 0;
    const netProfit = price - (price * c.pctStack + bundleFixed) - c.adCostPerDelivered;
    return {
      pieces,
      pricePerPiece: price / pieces,
      totalPrice: price,
      originalTotalPrice: originalFrom(price, discountPct),
      marginPct: price > 0 ? (netProfit / price) * 100 : 0,
      discountPct,
      profitPerBundle: netProfit,
    };
  });
}
