/**
 * Tool input schemas (JSON Schema subset) and a validator derived from them.
 * The same schema object is published in tools/list and used to validate calls,
 * so the two cannot drift apart (test plan M5).
 */

export interface NumberSchema {
  type: "number" | "integer";
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  default?: number;
}

export interface StringSchema {
  type: "string";
  description?: string;
  enum?: string[];
  pattern?: string;
  maxLength?: number;
  default?: string;
}

export interface ArraySchema {
  type: "array";
  description?: string;
  items: Schema;
  minItems?: number;
  maxItems?: number;
}

export interface ObjectSchema {
  type: "object";
  description?: string;
  properties: Record<string, Schema>;
  required: string[];
  additionalProperties: false;
}

export type Schema = NumberSchema | StringSchema | ArraySchema | ObjectSchema;

export interface FieldError {
  field: string;
  code: "required" | "type" | "range" | "unknown_field";
  message: string;
}

const LIMIT = 1e9;

const money = (description: string, dflt?: number): NumberSchema => ({
  type: "number",
  description,
  minimum: 0,
  maximum: LIMIT,
  ...(dflt === undefined ? {} : { default: dflt }),
});

const feePct = (description: string): NumberSchema => ({
  type: "number",
  description: `${description} (0–100).`,
  minimum: 0,
  exclusiveMaximum: 100,
  default: 0,
});

const ratePct = (description: string): NumberSchema => ({
  type: "number",
  description: `${description} (above 0, up to 100).`,
  exclusiveMinimum: 0,
  maximum: 100,
});

/** ISO 4217 codes for the 19 supported markets (+ USD) and their display decimals. */
export const CURRENCY_DECIMALS: Record<string, number> = {
  EGP: 2,
  SAR: 2,
  AED: 2,
  KWD: 3,
  QAR: 2,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  ILS: 2,
  LBP: 2,
  USD: 2,
  SYP: 2,
  IQD: 0,
  YER: 2,
  MAD: 2,
  DZD: 2,
  TND: 3,
  LYD: 3,
  SDG: 2,
  MRU: 2,
};

export const LANGS = ["ar", "en", "fr"] as const;
export type Lang = typeof LANGS[number];

/** Fields shared by every tool. Required-ness is decided per tool. */
export const PRODUCT_FIELDS: Record<string, Schema> = {
  productCost: money("Product cost per unit."),
  customsDutyPerUnit: money("Customs or import cost per unit.", 0),
  leadCpa: money("Ad cost per lead (CPA)."),
  confirmationRatePct: ratePct("Share of leads that confirm the order, in percent"),
  deliveryRatePct: ratePct("Share of confirmed orders delivered and paid, in percent"),
  deliveryFee: money("Shipping cost per delivered order."),
  returnShippingFee: money("Shipping cost per returned (RTO) order.", 0),
  packagingCost: money("Packaging cost per order.", 0),
  fulfillmentFee: money("Fulfillment cost per order.", 0),
  callCenterCostPerLead: money("Call-center cost per lead.", 0),
  smsCostPerLead: money("SMS cost per lead.", 0),
  platformFeePct: feePct("Platform or marketplace fee, % of revenue"),
  paymentGatewayPct: feePct("Payment gateway fee, % of revenue"),
  paymentGatewayFixed: money("Fixed payment gateway fee per order.", 0),
  vatPct: feePct("VAT, % of revenue"),
  marketerCommissionPct: feePct("Marketer or affiliate commission, % of revenue"),
  codFeePct: feePct(
    "Cash-on-delivery collection fee, % of the amount the courier collects (e.g. 2.5). " +
      "Ask the seller; couriers differ and many charge nothing",
  ),
  targetMarginPct: {
    type: "number",
    description: "Target net margin in percent (-100 to 100). Default 20.",
    exclusiveMinimum: -100,
    exclusiveMaximum: 100,
    default: 20,
  },
  sellingPrice: {
    type: "number",
    description: "The seller's selling price per piece.",
    exclusiveMinimum: 0,
    maximum: LIMIT,
  },
  currency: {
    type: "string",
    description: "ISO 4217 currency of every amount in this call. No conversion is done.",
    enum: Object.keys(CURRENCY_DECIMALS),
    default: "EGP",
  },
  market: {
    type: "string",
    description: "Seller's country, ISO 3166 alpha-2 (e.g. EG, SA, AE). Informational only.",
    pattern: "^[A-Z]{2}$",
  },
  lang: {
    type: "string",
    description: "Language of the text summary.",
    enum: [...LANGS],
    default: "ar",
  },
};

export const CAMPAIGN_SCHEMA: ObjectSchema = {
  type: "object",
  description: "Real campaign numbers for one product and one period.",
  properties: {
    adBudgetSpent: money("Total ad budget spent in the period."),
    leads: { type: "integer", description: "Leads (orders placed).", minimum: 0, maximum: LIMIT },
    confirmed: { type: "integer", description: "Confirmed orders.", minimum: 0, maximum: LIMIT },
    delivered: {
      type: "integer",
      description: "Delivered and paid orders.",
      minimum: 0,
      maximum: LIMIT,
    },
    inTransit: {
      type: "integer",
      description:
        "Confirmed orders still on their way: neither delivered nor returned yet. They are " +
        "left out of the delivery rate and charged no return shipping. Omit if unknown.",
      minimum: 0,
      maximum: LIMIT,
      default: 0,
    },
  },
  required: ["adBudgetSpent", "leads", "confirmed", "delivered"],
  additionalProperties: false,
};

export const TIERS_SCHEMA: ArraySchema = {
  type: "array",
  description:
    "Bundle tiers. Default: 2 pcs 15% margin 5% shown discount; 3 pcs 20%/10%; 4 pcs 25%/15%.",
  maxItems: 20,
  items: {
    type: "object",
    properties: {
      pieces: { type: "integer", minimum: 2, maximum: 50 },
      marginPct: { type: "number", exclusiveMinimum: -100, exclusiveMaximum: 100 },
      discountPct: { type: "number", minimum: 0, exclusiveMaximum: 100, default: 0 },
    },
    required: ["pieces", "marginPct"],
    additionalProperties: false,
  },
};

export const OFFERS_SCHEMA: ArraySchema = {
  type: "array",
  description: 'Offers to check, e.g. "2 for 550" → {pieces: 2, totalPrice: 550}.',
  maxItems: 20,
  items: {
    type: "object",
    properties: {
      pieces: { type: "integer", minimum: 1, maximum: 50 },
      totalPrice: { type: "number", exclusiveMinimum: 0, maximum: LIMIT },
    },
    required: ["pieces", "totalPrice"],
    additionalProperties: false,
  },
};

export const COMPETITORS_SCHEMA: ArraySchema = {
  type: "array",
  description:
    "Competitor offers the seller confirmed. Use the price the customer actually pays, not a " +
    "crossed-out 'was' price.",
  minItems: 1,
  maxItems: 30,
  items: {
    type: "object",
    properties: {
      label: { type: "string", description: "Competitor or store name.", maxLength: 80 },
      totalPrice: {
        type: "number",
        description: "Offer price for all pieces, before any separate shipping charge.",
        exclusiveMinimum: 0,
        maximum: LIMIT,
      },
      pieces: {
        type: "integer",
        description: "Pieces in the offer.",
        minimum: 1,
        maximum: 50,
        default: 1,
      },
      shippingCharged: money("Shipping the customer pays on top (0 if free shipping).", 0),
      source: { type: "string", description: "Link or source of the price.", maxLength: 500 },
      seenOn: {
        type: "string",
        description: "Date the price was seen (YYYY-MM-DD).",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
    required: ["label", "totalPrice"],
    additionalProperties: false,
  },
};

export const MARGINS_SCHEMA: ArraySchema = {
  type: "array",
  description: "Margins to tabulate, in percent. Default: 20, 15, 10, 5, 0, -5, -10, -20.",
  minItems: 1,
  maxItems: 20,
  items: { type: "number", exclusiveMinimum: -100, exclusiveMaximum: 100 },
};

export const SCENARIO_COMPETITORS_SCHEMA: ArraySchema = {
  type: "array",
  description:
    "Competitor single-piece prices the seller confirmed, so they appear as rows in the same " +
    "table. Use what the customer actually pays.",
  minItems: 1,
  maxItems: 10,
  items: {
    type: "object",
    properties: {
      label: { type: "string", description: "Competitor or store name.", maxLength: 80 },
      price: {
        type: "number",
        description: "What the customer pays for one piece.",
        exclusiveMinimum: 0,
        maximum: LIMIT,
      },
      source: { type: "string", description: "Link the price was read from.", maxLength: 400 },
    },
    required: ["label", "price"],
    additionalProperties: false,
  },
};

export const AD_SPEND_SCHEMA: NumberSchema = {
  type: "number",
  description:
    "Ad spend the revenue and profit columns are quoted for, in the same currency. Default 1000.",
  exclusiveMinimum: 0,
  maximum: LIMIT,
  default: 1000,
};

export const EXPORT_TEXT_SCHEMA: Schema = {
  type: "string",
  description:
    "The ad report exactly as the seller pasted or exported it (CSV, TSV or semicolon; Arabic " +
    "or English headers). Paste it unchanged — do not retype, reformat or sum anything.",
  maxLength: 20000,
};

export const MARKET_SCHEMA: Schema = {
  type: "string",
  description:
    "Two-letter country code (EG, MA, AE, SA). Returns the courier costs published for that " +
    "market, with their source. Other markets have nothing published: ask the seller instead.",
  maxLength: 2,
};

export function productSchema(
  required: string[],
  extra: Record<string, Schema> = {},
  extraRequired: string[] = [],
): ObjectSchema {
  return {
    type: "object",
    properties: { ...PRODUCT_FIELDS, ...extra },
    required: [...required, ...extraRequired],
    additionalProperties: false,
  };
}

// ─── validator ──────────────────────────────────────────────────────────────

function rangeText(s: NumberSchema): string {
  const parts: string[] = [];
  if (s.minimum !== undefined) parts.push(`≥ ${s.minimum}`);
  if (s.exclusiveMinimum !== undefined) parts.push(`> ${s.exclusiveMinimum}`);
  if (s.maximum !== undefined) parts.push(`≤ ${s.maximum}`);
  if (s.exclusiveMaximum !== undefined) parts.push(`< ${s.exclusiveMaximum}`);
  return parts.join(" and ");
}

export function validate(schema: Schema, value: unknown, path = ""): FieldError[] {
  const at = path || "(root)";
  switch (schema.type) {
    case "number":
    case "integer": {
      const isInt = schema.type === "integer";
      if (
        typeof value !== "number" || !Number.isFinite(value) || (isInt && !Number.isInteger(value))
      ) {
        return [{
          field: at,
          code: "type",
          message: isInt ? "must be a whole number" : "must be a number",
        }];
      }
      const out = (schema.minimum !== undefined && value < schema.minimum) ||
        (schema.maximum !== undefined && value > schema.maximum) ||
        (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) ||
        (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum);
      return out ? [{ field: at, code: "range", message: `must be ${rangeText(schema)}` }] : [];
    }
    case "string": {
      if (typeof value !== "string") return [{ field: at, code: "type", message: "must be text" }];
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return [{
          field: at,
          code: "range",
          message: `must be at most ${schema.maxLength} characters`,
        }];
      }
      if (schema.enum && !schema.enum.includes(value)) {
        return [{ field: at, code: "range", message: `must be one of ${schema.enum.join(", ")}` }];
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        return [{ field: at, code: "range", message: `must match ${schema.pattern}` }];
      }
      return [];
    }
    case "array": {
      if (!Array.isArray(value)) return [{ field: at, code: "type", message: "must be a list" }];
      if (
        (schema.minItems !== undefined && value.length < schema.minItems) ||
        (schema.maxItems !== undefined && value.length > schema.maxItems)
      ) {
        return [{
          field: at,
          code: "range",
          message: `must have ${schema.minItems ?? 0}–${schema.maxItems ?? "∞"} items`,
        }];
      }
      return value.flatMap((v, i) => validate(schema.items, v, `${path}[${i}]`));
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [{ field: at, code: "type", message: "must be an object" }];
      }
      const obj = value as Record<string, unknown>;
      const prefix = path ? `${path}.` : "";
      const errors: FieldError[] = [];
      for (const key of schema.required) {
        if (obj[key] === undefined) {
          errors.push({ field: prefix + key, code: "required", message: "is required" });
        }
      }
      for (const [key, v] of Object.entries(obj)) {
        const sub = schema.properties[key];
        if (!sub) {
          errors.push({
            field: prefix + key,
            code: "unknown_field",
            message: "is not a known field",
          });
        } else if (v !== undefined) {
          errors.push(...validate(sub, v, prefix + key));
        }
      }
      return errors;
    }
  }
}

export interface Assumption {
  field: string;
  value: number | string;
  reason: "default";
}

/** Fills schema defaults (recursively for object/array items) and lists the top-level ones used. */
export function applyDefaults(
  schema: ObjectSchema,
  args: Record<string, unknown>,
  ignored: string[] = [],
): { values: Record<string, unknown>; assumptions: Assumption[] } {
  const values: Record<string, unknown> = {};
  const assumptions: Assumption[] = [];
  for (const [key, sub] of Object.entries(schema.properties)) {
    if (ignored.includes(key)) continue;
    const given = args[key];
    if (given !== undefined) {
      values[key] = fillNested(sub, given);
    } else if ("default" in sub && sub.default !== undefined) {
      values[key] = sub.default;
      assumptions.push({ field: key, value: sub.default, reason: "default" });
    }
  }
  return { values, assumptions };
}

function fillNested(schema: Schema, value: unknown): unknown {
  if (schema.type === "array" && Array.isArray(value)) {
    return value.map((v) => fillNested(schema.items, v));
  }
  if (schema.type === "object" && value && typeof value === "object") {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (out[k] === undefined && "default" in sub && sub.default !== undefined) {
        out[k] = sub.default;
      }
    }
    return out;
  }
  return value;
}
