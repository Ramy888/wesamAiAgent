/**
 * Public courier costs per market, for sellers who don't know their own numbers yet.
 *
 * Mirrors `reference/market-defaults.json`, which holds the full sourcing notes; a test keeps
 * the two in step. Only markets with a figure printed on a courier's own page appear here.
 * Everything else is absent on purpose: Bya3 must ask rather than assume.
 */

export interface MarketCosts {
  currency: string;
  /** Per delivered order, in the market's own currency, excluding VAT. */
  deliveryFeeLow: number;
  deliveryFeeHigh: number;
  deliveryFeeTypical: number | null;
  returnShippingFee: number | null;
  /** Some couriers state a rule instead of a number. */
  returnEqualsDeliveryFee: boolean;
  codFeePct: number | null;
  source: string;
  note: string;
}

export const MARKET_COSTS: Record<string, MarketCosts> = {
  EG: {
    currency: "EGP",
    deliveryFeeLow: 45,
    deliveryFeeHigh: 140,
    deliveryFeeTypical: 97,
    returnShippingFee: 87,
    returnEqualsDeliveryFee: false,
    codFeePct: null,
    source: "https://bosta.co/en-eg/pricing",
    note:
      "Bosta list price by zone before VAT: Cairo 97, Alexandria 102, Delta 110, Upper Egypt 140. " +
      "Returns 87 flat. A high-volume seller pays less; noon's 45-79 is the floor.",
  },
  MA: {
    currency: "MAD",
    deliveryFeeLow: 18,
    deliveryFeeHigh: 50,
    deliveryFeeTypical: 35,
    returnShippingFee: 0,
    returnEqualsDeliveryFee: false,
    codFeePct: null,
    source: "https://forcelog.ma/tarifs-colis/",
    note:
      "Pickup city 18-28, major cities about 35, regions 40-50. Three COD couriers print a return " +
      "fee of 0 across hundreds of cities.",
  },
  AE: {
    currency: "AED",
    deliveryFeeLow: 17.31,
    deliveryFeeHigh: 35,
    deliveryFeeTypical: null,
    returnShippingFee: null,
    returnEqualsDeliveryFee: true,
    codFeePct: 2.5,
    source: "https://quiqup.com/terms-of-service",
    note:
      "Two published prices differ by about 2x (Jeebly 17.31, Quiqup 35 excl. 5% VAT), so there is " +
      "no honest typical. A return costs the full delivery fee; COD costs 2.5% of what is collected.",
  },
  SA: {
    currency: "SAR",
    deliveryFeeLow: 20,
    deliveryFeeHigh: 25,
    deliveryFeeTypical: 23,
    returnShippingFee: null,
    returnEqualsDeliveryFee: false,
    codFeePct: null,
    source: "https://zid.sa/ar/solutions/shipping/",
    note:
      "Via the Zid platform, excluding tax, first 10 kg: SPL 20, Aramex 23, SMSA 23. No courier " +
      "publishes a national merchant rate on its own site, and none publishes a return fee.",
  },
};

export const MARKETS_WITH_COSTS = Object.keys(MARKET_COSTS);
