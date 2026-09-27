/**
 * Short text summaries for the model to read (the `content` block).
 * Numbers are formatted from engine results only; nothing is computed here.
 */
import type {
  BundlesResult,
  CampaignResult,
  CompareResult,
  CpaTableResult,
  PriceProductResult,
  ScenariosResult,
  Warning,
} from "../engine/canonical.ts";
import { type Assumption, CURRENCY_DECIMALS, type FieldError, type Lang } from "./schema.ts";

interface Words {
  verdict: string;
  na: string;
  perOrder: string;
  atYourPrice: string;
  netProfit: string;
  suggested: string;
  breakeven: string;
  beRoas: string;
  maxCpa: string;
  atBreakeven: string;
  atTarget: string;
  youPay: string;
  requiredCr: string;
  raiseTo: string;
  warnings: string;
  assumptions: string;
  invalid: string;
  margin: string;
  viable: string;
  notViable: string;
  pieces: string;
  was: string;
  profit: string;
  offer: string;
  revenue: string;
  costs: string;
  budget: string;
  cpl: string;
  maxCpl: string;
  requiredPrice: string;
  rates: string;
  levers: string;
  lever: Record<"price" | "cpl", string>;
  infeasible: string;
  verdicts: Record<string, string>;
  warn: Record<Warning["code"], string>;
  market: string;
  offers: string;
  perPiece: string;
  median: string;
  yourPrice: string;
  cheaper: string;
  ifMatched: string;
  position: Record<"BELOW_BAND" | "IN_BAND" | "ABOVE_BAND", string>;
  scenarioBands: Record<"LOSS" | "CRITICAL" | "THIN" | "HEALTHY", string>;
  perSpend: string;
  ofAdSpend: string;
  orders: string;
  marketCosts: string;
  noPublicCosts: string;
  returnsEqualDelivery: string;
  returnFee: string;
  parsed: string;
  campaigns: string;
  results: string;
  totalSpend: string;
  rec: {
    PRICE_IN_BAND: string;
    PREMIUM_ONLY: string;
    CANNOT_COMPETE_ON_PRICE: string;
    NO_PROFITABLE_PRICE: string;
  };
}

const AR: Words = {
  verdict: "القرار",
  na: "غير متاح",
  perOrder: "للأوردر المُسلَّم",
  atYourPrice: "على سعرك",
  netProfit: "صافي الربح",
  suggested: "السعر المقترح",
  breakeven: "سعر التعادل",
  beRoas: "ROAS التعادل",
  maxCpa: "أقصى CPA للّيد",
  atBreakeven: "على التعادل",
  atTarget: "على الهامش المستهدف",
  youPay: "بتدفع حاليًا",
  requiredCr: "نسبة التأكيد المطلوبة للهدف",
  raiseTo: "ارفع السعر إلى",
  warnings: "تنبيهات",
  assumptions: "افتراضات",
  invalid: "في مدخلات محتاجة تتصلّح",
  margin: "هامش",
  viable: "مناسب",
  notViable: "خسارة",
  pieces: "قطع",
  was: "بدل",
  profit: "ربح",
  offer: "عرض",
  revenue: "الإيراد",
  costs: "التكاليف قبل الإعلان",
  budget: "صرف الإعلان",
  cpl: "تكلفة الليد",
  maxCpl: "أقصى تكلفة ليد للهدف",
  requiredPrice: "السعر المطلوب للهدف",
  rates: "التأكيد / التسليم الفعلي",
  levers: "أهم خطوة",
  lever: { price: "ارفع السعر من", cpl: "قلّل تكلفة الليد من" },
  infeasible: "(مش كفاية لوحدها)",
  verdicts: {
    LOSS: "خسارة",
    BELOW_TARGET: "تحت الهدف",
    ON_TARGET: "على الهدف",
    PAUSE: "وقّف الإعلان",
    FIX: "صلّح الحملة",
    SCALE: "كبّر الحملة",
  },
  warn: {
    STACK_GE_100: "مجموع الضرايب والعمولات 100% أو أكتر، مفيش سعر يكسب",
    STACK_PLUS_MARGIN_GE_100: "العمولات + الهامش المستهدف 100% أو أكتر، مفيش سعر مقترح",
    PRICE_BELOW_BREAKEVEN: "سعرك أقل من سعر التعادل",
    CPA_ABOVE_MAX: "تكلفة الليد أعلى من أقصى CPA على التعادل",
    REQUIRED_CR_UNREACHABLE: "مفيش نسبة تأكيد توصلك للهدف على السعر ده",
    NEGATIVE_TARGET_MARGIN: "الهامش المستهدف سالب",
    COUNTS_INCONSISTENT: "الأعداد مش منطقية (المُسلَّم أكتر من المؤكد أو المؤكد أكتر من الليدز)",
    NO_DELIVERIES: "مفيش أوردرات مُسلَّمة",
    NO_AD_BUDGET: "صرف الإعلان صفر",
    OFFER_BELOW_BREAKEVEN: "عرض بيخسر",
    FEW_COMPETITORS: "عدد المنافسين قليل (أقل من 3)، النتيجة تقريبية",
    VOLUME_UNDEFINED: "من غير تكلفة إعلان مفيش عدد أوردرات نحسب عليه",
    ORDERS_IN_TRANSIT: "في أوردرات لسه في الطريق؛ محسوبة بره النتيجة لحد ما توصل أو ترجع",
  },
  market: "السوق",
  offers: "عروض",
  perPiece: "للقطعة",
  median: "الوسيط",
  yourPrice: "سعرك",
  cheaper: "من المنافسين أرخص منك",
  ifMatched: "لو نزلت بنفس العرض",
  position: {
    BELOW_BAND: "أقل من النطاق المقترح",
    IN_BAND: "جوه النطاق المقترح",
    ABOVE_BAND: "أعلى من النطاق المقترح",
  },
  scenarioBands: {
    LOSS: "خسارة",
    CRITICAL: "ضعيف جدًا",
    THIN: "تحت الهدف",
    HEALTHY: "كويس",
  },
  perSpend: "لكل",
  ofAdSpend: "إعلان",
  orders: "أوردر",
  marketCosts: "تكاليف الشحن المنشورة",
  noPublicCosts: "مفيش أسعار منشورة للسوق ده — اسأل الافندينا",
  returnsEqualDelivery: "المرتجع بيتحاسب بنفس سعر التوصيل",
  returnFee: "تكلفة المرتجع",
  parsed: "قريت من الملف",
  campaigns: "حملات",
  results: "نتائج",
  totalSpend: "إجمالي الصرف",
  rec: {
    PRICE_IN_BAND: "السعر المقترح في السوق: {low} – {high}",
    PREMIUM_ONLY: "مينفعش تنافس على الرخص؛ اتموضع أغلى: {low} – {high} (الوسيط {median})",
    CANNOT_COMPETE_ON_PRICE:
      "مش هتقدر تنافس بالسعر: سعرك الآمن {sug} أعلى من كل المنافسين (أعلى سعر {max}). استخدم باكدج أو قلّل التكلفة",
    NO_PROFITABLE_PRICE: "مفيش سعر يكسب بالرسوم دي",
  },
};

const EN: Words = {
  verdict: "Verdict",
  na: "n/a",
  perOrder: "per delivered order",
  atYourPrice: "At your price",
  netProfit: "net profit",
  suggested: "Suggested price",
  breakeven: "breakeven price",
  beRoas: "Breakeven ROAS",
  maxCpa: "Max CPA per lead",
  atBreakeven: "at breakeven",
  atTarget: "at target margin",
  youPay: "you pay",
  requiredCr: "confirmation rate needed for target",
  raiseTo: "raise the price to",
  warnings: "Warnings",
  assumptions: "Assumptions",
  invalid: "Some inputs need fixing",
  margin: "margin",
  viable: "ok",
  notViable: "loss",
  pieces: "pcs",
  was: "was",
  profit: "profit",
  offer: "Offer",
  revenue: "Revenue",
  costs: "costs before ads",
  budget: "ad budget",
  cpl: "CPL",
  maxCpl: "max CPL for target",
  requiredPrice: "price needed for target",
  rates: "actual CR / DR",
  levers: "Top lever",
  lever: { price: "raise price from", cpl: "cut CPL from" },
  infeasible: "(not enough on its own)",
  verdicts: {
    LOSS: "LOSS",
    BELOW_TARGET: "BELOW TARGET",
    ON_TARGET: "ON TARGET",
    PAUSE: "PAUSE",
    FIX: "FIX",
    SCALE: "SCALE",
  },
  warn: {
    STACK_GE_100: "fees and taxes total 100% or more; no price can profit",
    STACK_PLUS_MARGIN_GE_100: "fees plus target margin reach 100%; no suggested price",
    PRICE_BELOW_BREAKEVEN: "your price is below breakeven",
    CPA_ABOVE_MAX: "lead CPA is above the breakeven max CPA",
    REQUIRED_CR_UNREACHABLE: "no confirmation rate reaches the target at this price",
    NEGATIVE_TARGET_MARGIN: "target margin is negative",
    COUNTS_INCONSISTENT: "counts are inconsistent (delivered > confirmed or confirmed > leads)",
    NO_DELIVERIES: "no delivered orders",
    NO_AD_BUDGET: "ad budget is zero",
    OFFER_BELOW_BREAKEVEN: "an offer loses money",
    FEW_COMPETITORS: "fewer than 3 competitors; treat the comparison as rough",
    VOLUME_UNDEFINED: "with no ad cost there is no order volume to work from",
    ORDERS_IN_TRANSIT:
      "some orders are still on their way; they are left out until they arrive or come back",
  },
  market: "Market",
  offers: "offers",
  perPiece: "per piece",
  median: "median",
  yourPrice: "Your price",
  cheaper: "of competitors are cheaper",
  ifMatched: "if you matched",
  position: {
    BELOW_BAND: "below the recommended band",
    IN_BAND: "inside the recommended band",
    ABOVE_BAND: "above the recommended band",
  },
  scenarioBands: {
    LOSS: "loss",
    CRITICAL: "very thin",
    THIN: "below target",
    HEALTHY: "good",
  },
  perSpend: "per",
  ofAdSpend: "of ad spend",
  orders: "orders",
  marketCosts: "published shipping costs",
  noPublicCosts: "nothing is published for this market — ask the seller",
  returnsEqualDelivery: "a return costs the same as a delivery",
  returnFee: "return fee",
  parsed: "Read from your export",
  campaigns: "campaigns",
  results: "results",
  totalSpend: "total spend",
  rec: {
    PRICE_IN_BAND: "Recommended market price: {low} – {high}",
    PREMIUM_ONLY: "Don't compete on cheapness; position premium: {low} – {high} (median {median})",
    CANNOT_COMPETE_ON_PRICE:
      "You can't compete on price: your safe price {sug} is above every competitor (max {max}). Use a bundle or cut costs",
    NO_PROFITABLE_PRICE: "No price is profitable with these fees",
  },
};

const FR: Words = {
  ...EN,
  verdict: "Verdict",
  na: "n/d",
  perOrder: "par commande livrée",
  atYourPrice: "À votre prix",
  netProfit: "bénéfice net",
  suggested: "Prix conseillé",
  breakeven: "prix d'équilibre",
  beRoas: "ROAS d'équilibre",
  maxCpa: "CPA max par lead",
  atBreakeven: "à l'équilibre",
  atTarget: "à la marge cible",
  youPay: "vous payez",
  requiredCr: "taux de confirmation requis",
  raiseTo: "montez le prix à",
  warnings: "Alertes",
  assumptions: "Hypothèses",
  invalid: "Certaines entrées sont à corriger",
  profit: "bénéfice",
  offer: "Offre",
  revenue: "Chiffre d'affaires",
  costs: "coûts hors pub",
  budget: "budget pub",
  maxCpl: "CPL max pour la cible",
  requiredPrice: "prix requis pour la cible",
  rates: "CR / DR réels",
  levers: "Levier principal",
  lever: { price: "monter le prix de", cpl: "baisser le CPL de" },
  infeasible: "(insuffisant seul)",
  market: "Marché",
  offers: "offres",
  perPiece: "par pièce",
  median: "médiane",
  yourPrice: "Votre prix",
  cheaper: "des concurrents sont moins chers",
  ifMatched: "si vous alignez",
  position: {
    BELOW_BAND: "sous la fourchette",
    IN_BAND: "dans la fourchette",
    ABOVE_BAND: "au-dessus de la fourchette",
  },
  rec: {
    PRICE_IN_BAND: "Prix de marché conseillé : {low} – {high}",
    PREMIUM_ONLY:
      "Ne jouez pas le moins cher ; positionnement premium : {low} – {high} (médiane {median})",
    CANNOT_COMPETE_ON_PRICE:
      "Impossible de rivaliser sur le prix : votre prix sûr {sug} dépasse tous les concurrents (max {max}). Proposez un lot ou réduisez les coûts",
    NO_PROFITABLE_PRICE: "Aucun prix n'est rentable avec ces frais",
  },
  verdicts: {
    LOSS: "PERTE",
    BELOW_TARGET: "SOUS LA CIBLE",
    ON_TARGET: "SUR LA CIBLE",
    PAUSE: "PAUSE",
    FIX: "CORRIGER",
    SCALE: "AUGMENTER",
  },
};

const WORDS: Record<Lang, Words> = { ar: AR, en: EN, fr: FR };

export class Fmt {
  readonly w: Words;
  private readonly money: Intl.NumberFormat;
  private readonly plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

  constructor(lang: Lang, readonly currency: string) {
    this.w = WORDS[lang];
    const d = CURRENCY_DECIMALS[currency] ?? 2;
    this.money = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
      useGrouping: false,
    });
  }

  m(v: number | null | undefined): string {
    return v === null || v === undefined ? this.w.na : `${this.money.format(v)} ${this.currency}`;
  }

  pct(v: number | null | undefined): string {
    return v === null || v === undefined ? this.w.na : `${v.toFixed(1)}%`;
  }

  n(v: number | null | undefined): string {
    return v === null || v === undefined ? this.w.na : this.plain.format(v);
  }

  tail(warnings: Warning[], assumptions: Assumption[]): string[] {
    const lines: string[] = [];
    if (warnings.length) {
      const unique = [...new Set(warnings.map((x) => x.code))];
      lines.push(`${this.w.warnings}: ${unique.map((c) => this.w.warn[c]).join("; ")}.`);
    }
    if (assumptions.length) {
      lines.push(
        `${this.w.assumptions}: ${assumptions.map((a) => `${a.field}=${a.value}`).join(", ")}.`,
      );
    }
    return lines;
  }
}

export function priceProductText(f: Fmt, r: PriceProductResult, leadCpa: number): string[] {
  const w = f.w;
  const lines: string[] = [];
  const s = r.atSellingPrice;
  if (s && r.verdict) {
    const raise = r.verdict.raiseTo === null ? "" : ` → ${w.raiseTo} ${f.m(r.verdict.raiseTo)}`;
    lines.push(`${w.verdict}: ${w.verdicts[r.verdict.code]}${raise}.`);
    lines.push(
      `${w.atYourPrice} ${f.m(s.price)}: ${w.netProfit} ${f.m(s.netProfit)} ${w.perOrder} (${
        f.pct(s.netMarginPct)
      }).`,
    );
    lines.push(
      `${w.maxCpa}: ${f.m(s.maxCpaBreakeven)} ${w.atBreakeven}, ${
        f.m(s.maxCpaAtTarget)
      } ${w.atTarget} (${w.youPay} ${f.m(leadCpa)}).`,
    );
    lines.push(
      `${w.beRoas}: ${f.n(s.breakEvenRoas)} · ${w.requiredCr}: ${f.pct(s.requiredCrPct)}.`,
    );
  }
  lines.push(
    `${w.suggested}: ${f.m(r.suggestedPrice)} · ${w.breakeven}: ${f.m(r.breakevenPrice)}.`,
  );
  if (!s && r.atSuggested) {
    lines.push(
      `${w.maxCpa}: ${f.m(r.atSuggested.maxCpaBreakeven)} · ${w.beRoas}: ${
        f.n(r.atSuggested.breakEvenRoas)
      }.`,
    );
  }
  return lines;
}

export function cpaTableText(f: Fmt, r: CpaTableResult): string[] {
  const w = f.w;
  const rows = r.rows.map((x) =>
    `${x.marginPct}% ${w.margin}: ${f.m(x.maxCpaPerLead)} (${x.viable ? w.viable : w.notViable})`
  );
  return [
    `${w.verdict}: ${w.verdicts[r.headline.verdict]} · ${w.atYourPrice} ${f.m(r.price)}.`,
    `${w.maxCpa}: ${f.m(r.headline.maxCpaBreakeven)} ${w.atBreakeven}, ${
      f.m(r.headline.maxCpaAtTarget)
    } ${w.atTarget} (${w.youPay} ${f.m(r.headline.currentLeadCpa)}).`,
    ...rows,
  ];
}

export function bundlesText(f: Fmt, r: BundlesResult): string[] {
  const w = f.w;
  const tiers = r.tiers.map((t) =>
    `${t.pieces} ${w.pieces}: ${f.m(t.price)} (${w.was} ${f.m(t.originalPrice)}) · ${w.profit} ${
      f.m(t.profit)
    } · ${w.margin} ${f.pct(t.achievedMarginPct)}`
  );
  const offers = r.offers.map((o) =>
    `${w.offer} ${o.pieces} ${w.pieces} = ${f.m(o.totalPrice)}: ${
      w.verdicts[o.verdict]
    } · ${w.profit} ${f.m(o.profit)} (${f.pct(o.marginPct)})`
  );
  return [...tiers, ...offers];
}

export function campaignText(f: Fmt, r: CampaignResult): string[] {
  const w = f.w;
  const lines = [
    `${w.verdict}: ${r.verdict === null ? w.na : w.verdicts[r.verdict]}.`,
    `${w.revenue} ${f.m(r.revenue)} · ${w.costs} ${f.m(r.totalCosts)} · ${w.netProfit} ${
      f.m(r.netProfit)
    } (${f.pct(r.netMarginPct)}).`,
    `${w.cpl} ${f.m(r.cpl)} · ${w.maxCpl} ${f.m(r.maxCplAtTarget)} · ${w.requiredPrice} ${
      f.m(r.requiredPrice)
    } · ${w.rates} ${f.pct(r.crPct)} / ${f.pct(r.drPct)}.`,
  ];
  const top = r.levers[0];
  if (top) {
    lines.push(
      `${w.levers}: ${w.lever[top.lever]} ${f.m(top.current)} → ${f.m(top.target)}${
        top.feasible ? "" : ` ${w.infeasible}`
      }.`,
    );
  }
  return lines;
}

export function compareText(f: Fmt, r: CompareResult): string[] {
  const w = f.w;
  const m = r.market;
  const rec = w.rec[r.recommendation.code]
    .replace("{low}", f.m(r.recommendation.low))
    .replace("{high}", f.m(r.recommendation.high))
    .replace("{median}", f.m(m.median))
    .replace("{sug}", f.m(r.suggestedPrice))
    .replace("{max}", f.m(m.max));
  const lines = [
    `${w.verdict}: ${rec}.`,
    `${w.market} (${m.count} ${w.offers}, ${w.perPiece}): ${f.m(m.min)} – ${
      f.m(m.max)
    }, ${w.median} ${f.m(m.median)}.`,
  ];
  if (r.seller) {
    lines.push(
      `${w.yourPrice} ${f.m(r.seller.price)}: ${
        r.seller.position === null ? w.na : w.position[r.seller.position]
      }; ${f.pct(r.seller.shareCheaperPct)} ${w.cheaper}.`,
    );
  }
  lines.push(
    `${w.suggested}: ${f.m(r.suggestedPrice)} · ${w.breakeven}: ${f.m(r.breakevenPrice)}.`,
  );
  for (const c of r.competitors) {
    lines.push(
      `${c.label}: ${f.m(c.pricePerPiece)} ${w.perPiece} → ${w.ifMatched}: ${w.profit} ${
        f.m(c.ifMatched.profit)
      } (${f.pct(c.ifMatched.marginPct)}) ${w.verdicts[c.ifMatched.verdict]}`,
    );
  }
  return lines;
}

export function scenariosText(f: Fmt, r: ScenariosResult): string[] {
  const w = f.w;
  const lines = [
    `${w.suggested}: ${f.m(r.suggestedPrice)} · ${w.breakeven}: ${f.m(r.breakevenPrice)}.`,
    `${w.revenue}/${w.profit} ${w.perSpend} ${f.m(r.adSpendAssumed)} ${w.ofAdSpend}` +
    (r.deliveredPerSpend === null ? ` — ${w.na}.` : ` ≈ ${f.n(r.deliveredPerSpend)} ${w.orders}.`),
  ];
  for (const row of r.rows) {
    const who = row.kind === "you" ? w.yourPrice : row.who;
    lines.push(
      `${f.m(row.price)} (${who}): ${w.profit} ${f.m(row.profitPerOrder)} ` +
        `(${f.pct(row.marginPct)}) — ${w.scenarioBands[row.band]}` +
        (row.revenue === null ? "." : `; ${w.revenue} ${f.m(row.revenue)}, ${f.m(row.profit)}.`),
    );
  }
  return lines;
}

export function marketCostsText(f: Fmt, r: Record<string, unknown>): string[] {
  const w = f.w;
  if (!r.found) return [`${w.marketCosts}: ${w.noPublicCosts}.`];
  const lines = [
    `${w.marketCosts} (${r.market}): ${f.m(r.deliveryFeeLow as number)} – ${
      f.m(r.deliveryFeeHigh as number)
    }` + (r.deliveryFeeTypical === null ? "." : `, ~${f.m(r.deliveryFeeTypical as number)}.`),
  ];
  lines.push(
    r.returnEqualsDeliveryFee
      ? `${w.returnFee}: ${w.returnsEqualDelivery}.`
      : `${w.returnFee}: ${f.m(r.returnShippingFee as number | null)}.`,
  );
  lines.push(String(r.note ?? ""));
  lines.push(String(r.source ?? ""));
  return lines.filter(Boolean);
}

export function exportText(f: Fmt, r: Record<string, unknown>): string[] {
  const w = f.w;
  const rows = (r.rows ?? []) as {
    campaign: string;
    spend: number | null;
    results: number | null;
  }[];
  const totals = r.totals as { spend: number; results: number };
  if (rows.length === 0) return [w.invalid];
  const lines = [`${w.parsed}: ${rows.length} ${w.campaigns}.`];
  for (const row of rows) {
    lines.push(
      `${row.campaign}: ${w.budget} ${f.m(row.spend)}, ${
        row.results === null ? w.na : f.n(row.results)
      } ${w.results}`,
    );
  }
  if (rows.length > 1) {
    lines.push(`${w.totalSpend}: ${f.m(totals.spend)}, ${f.n(totals.results)} ${w.results}.`);
  }
  return lines;
}

export function errorsText(lang: Lang, errors: FieldError[]): string {
  const w = WORDS[lang];
  return `${w.invalid}: ${errors.map((e) => `${e.field} ${e.message}`).join("; ")}.`;
}
