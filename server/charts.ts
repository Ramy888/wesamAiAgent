/**
 * Server-drawn charts for tool answers.
 *
 * A tool puts its own (rounded) result numbers into a chart payload and signs it. The link
 * `/chart/<kind>/<payload>.<sig>.svg` is stateless: the endpoint only draws payloads this
 * server signed, so a chart can never disagree with the numbers in the text, and nobody can
 * use the endpoint to draw fake "Hesba" charts.
 *
 * SVGs are shown inside <img> in Wesam, so: no scripts, no external links, no web fonts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { CURRENCY_DECIMALS } from "./schema.ts";

export const CHART_KINDS = ["cost", "cpa", "market", "funnel", "bundles", "scenarios"] as const;
export type ChartKind = typeof CHART_KINDS[number];

const SIG_HEX = 24;
export const MAX_CHART_PATH = 4096;

// ─── signing ────────────────────────────────────────────────────────────────

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

function fromB64url(s: string): string {
  const b = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}

const sign = (kind: string, payload: string, secret: string) =>
  createHmac("sha256", secret).update(`${kind}.${payload}`).digest("hex").slice(0, SIG_HEX);

export function signChart(kind: ChartKind, data: unknown, secret: string): string {
  const payload = b64url(JSON.stringify(data));
  return `${payload}.${sign(kind, payload, secret)}`;
}

/** Returns the signed data, or null when the token is malformed or not signed by us. */
export function verifyChart(kind: string, token: string, secret: string): unknown | null {
  const m = token.match(/^([A-Za-z0-9_-]+)\.([a-f0-9]+)$/);
  if (!m || m[2].length !== SIG_HEX) return null;
  const expected = new TextEncoder().encode(sign(kind, m[1], secret));
  const given = new TextEncoder().encode(m[2]);
  if (!timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(fromB64url(m[1]));
  } catch {
    return null;
  }
}

// ─── drawing helpers ────────────────────────────────────────────────────────

/** Light theme only (dark steps validated but not shipped: img-SVG theming is unverified). */
const C = {
  surface: "#FFFFFF",
  border: "#E6E0D2",
  grid: "#E9ECEA",
  text: "#0B1F17",
  muted: "#5B6B63",
  series: "#0E9F6E", // emerald, validated with `you`
  you: "#B7791F", // amber, validated with `series`
  other: "#A3AAA6", // neutral, never a series
  good: "#0CA30C",
  critical: "#D03B3B",
};

const FONT = `'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif`;
const W = 800;
const PAD = 28;

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

type Num = number | null | undefined;

function num(v: Num, decimals: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function requireArray(v: unknown, name: string): unknown[] {
  if (!Array.isArray(v)) throw new TypeError(`chart data: ${name} must be a list`);
  return v;
}

function text(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; weight?: number; fill?: string; anchor?: string; rtl?: boolean } = {},
): string {
  const { size = 22, weight = 400, fill = C.text, anchor = "start", rtl = false } = opts;
  // `anchor` is visual (start = left edge). In RTL, SVG's start/end are logical, so flip them.
  const flip: Record<string, string> = { start: "end", end: "start", middle: "middle" };
  const a = rtl ? flip[anchor] : anchor;
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ` +
    `text-anchor="${a}"${rtl ? ' direction="rtl"' : ""}>${esc(s)}</text>`;
}

/** Bar with 4px rounded data end and a square baseline end (horizontal). */
function hbar(x0: number, x1: number, y: number, h: number, fill: string): string {
  const left = Math.min(x0, x1);
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return "";
  const r = Math.min(4, w / 2, h / 2);
  const grow = x1 >= x0; // rounded on the data end
  const d = grow
    ? `M${left},${y}H${left + w - r}Q${left + w},${y} ${left + w},${y + r}V${y + h - r}Q${
      left + w
    },${y + h} ${left + w - r},${y + h}H${left}Z`
    : `M${left + w},${y}H${left + r}Q${left},${y} ${left},${y + r}V${y + h - r}Q${left},${y + h} ${
      left + r
    },${y + h}H${left + w}Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}

/** Column with a rounded data end (vertical). */
function vbar(x: number, w: number, y0: number, y1: number, fill: string): string {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const r = Math.min(4, w / 2, h / 2);
  const up = y1 <= y0;
  const d = up
    ? `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${
      x + w
    },${top + r}V${top + h}Z`
    : `M${x},${top}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + w - r}Q${x + w},${
      top + h
    } ${x + w},${top + h - r}V${top}Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}

function frame(height: number, titleAr: string, titleEn: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" ` +
    `height="${height}" font-family="${FONT}" role="img" aria-label="${esc(titleEn)}">` +
    `<rect x="1" y="1" width="${W - 2}" height="${
      height - 2
    }" rx="18" fill="${C.surface}" stroke="${C.border}" stroke-width="2"/>` +
    text(W - PAD, 50, titleAr, { size: 30, weight: 700, anchor: "end", rtl: true }) +
    text(W - PAD, 84, titleEn, { size: 22, fill: C.muted, anchor: "end" }) +
    body +
    text(PAD, height - 18, "Hesba · حِسبة", { size: 18, fill: C.muted }) +
    `</svg>`;
}

/** Two-line bilingual row label, right-aligned at x. */
function rowLabel(x: number, yMid: number, ar: string, en: string): string {
  return text(x, yMid - 3, ar, { size: 22, anchor: "end", rtl: true }) +
    text(x, yMid + 21, en, { size: 17, fill: C.muted, anchor: "end" });
}

function legend(y: number, items: [string, string][]): string {
  let x = PAD;
  return items.map(([color, label]) => {
    const out = `<rect x="${x}" y="${y - 14}" width="16" height="16" rx="4" fill="${color}"/>` +
      text(x + 24, y, label, { size: 19, fill: C.muted });
    x += 40 + label.length * 9.5;
    return out;
  }).join("");
}

function scale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const span = domainMax - domainMin || 1;
  return (v: number) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin);
}

const decimalsFor = (cur: unknown) =>
  typeof cur === "string" && cur in CURRENCY_DECIMALS ? CURRENCY_DECIMALS[cur] : 2;

// ─── 1. cost breakdown ──────────────────────────────────────────────────────

const COST_LABELS: Record<string, [string, string]> = {
  productCost: ["تكلفة المنتج", "Product cost"],
  blendedShipping: ["الشحن والمرتجع", "Shipping & returns"],
  operations: ["التغليف والتجهيز", "Packing & fulfillment"],
  leadProcessing: ["الكول سنتر والرسائل", "Call center & SMS"],
  gatewayFixed: ["رسوم الدفع الثابتة", "Fixed payment fee"],
  revenuePctStack: ["الضرايب والعمولات", "Taxes & commissions"],
  adCostPerDelivered: ["الإعلانات", "Ads"],
};

function costChart(d: Record<string, unknown>): string {
  const dec = decimalsFor(d.cur);
  const items = requireArray(d.items, "items") as [string, Num][];
  const net = d.net as Num;
  const rows: { ar: string; en: string; v: Num; color: string; status?: string }[] = items.map((
    [k, v],
  ) => {
    const [ar, en] = COST_LABELS[k] ?? [k, k];
    return { ar, en, v, color: C.series };
  });
  const isLoss = isNum(net) && net < 0;
  rows.push({
    ar: "صافي الربح",
    en: "Net profit",
    v: net,
    color: isLoss ? C.critical : C.good,
    status: isNum(net) ? (isLoss ? "Loss · خسارة" : "Profit · ربح") : undefined,
  });

  const values = rows.map((r) => r.v).filter(isNum);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const labelX = 250;
  const plotL = 270;
  const plotR = 640;
  const x = scale(lo, hi, plotL, plotR);
  const top = 120;
  const rowH = 58;
  let body = `<line x1="${x(0)}" y1="${top - 10}" x2="${x(0)}" y2="${
    top + rows.length * rowH
  }" stroke="${C.grid}" stroke-width="1"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const mid = y + rowH / 2;
    if (i === rows.length - 1) {
      body += `<line x1="${PAD}" y1="${y - 4}" x2="${W - PAD}" y2="${
        y - 4
      }" stroke="${C.grid}" stroke-width="1"/>`;
    }
    body += rowLabel(labelX, mid, r.ar, r.en);
    if (isNum(r.v)) body += hbar(x(0), x(r.v), mid - 11, 22, r.color);
    const end = isNum(r.v) ? Math.max(x(r.v), x(0)) : x(0);
    body += text(end + 10, mid + 8, num(r.v, dec), { size: 22, weight: r.status ? 700 : 400 });
    if (r.status) {
      body += text(end + 10, mid + 32, r.status, { size: 17, fill: C.muted });
    }
  });
  const h = top + rows.length * rowH + 60;
  const titleEn = `Where each order's money goes · price ${num(d.price as Num, dec)} ${
    String(d.cur ?? "")
  }`;
  return frame(h, "فين بتروح فلوس كل أوردر؟", titleEn, body);
}

// ─── 2. CPA by margin ───────────────────────────────────────────────────────

function cpaChart(d: Record<string, unknown>): string {
  const dec = decimalsFor(d.cur);
  const rows = requireArray(d.rows, "rows") as [number, number, boolean][];
  const current = d.current as Num;
  const target = d.target as Num;
  const values = [...rows.map((r) => r[1]), ...(isNum(current) ? [current] : [])];
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values) * 1.15 || 1;
  const top = 130;
  const bottom = 420;
  const y = scale(lo, hi, bottom, top);
  const plotL = PAD + 20;
  const plotR = W - PAD - 20;
  const band = (plotR - plotL) / Math.max(rows.length, 1);
  const bw = Math.min(24 * 1.6, band * 0.5);
  let body = `<line x1="${plotL}" y1="${y(0)}" x2="${plotR}" y2="${y(0)}" stroke="${C.grid}"/>`;
  rows.forEach(([m, v, viable], i) => {
    const cx = plotL + band * (i + 0.5);
    body += vbar(cx - bw / 2, bw, y(0), y(v), viable ? C.series : C.other);
    body += text(cx, bottom + 34, `${m > 0 ? "+" : ""}${m}%`, { size: 20, anchor: "middle" });
    if (m === 0 || m === target) {
      const ly = v >= 0 ? y(v) - 10 : y(v) + 26;
      body += text(cx, ly, num(v, dec), { size: 20, weight: 700, anchor: "middle" });
    }
  });
  if (isNum(current)) {
    const cy = y(current);
    body +=
      `<line x1="${plotL}" y1="${cy}" x2="${plotR}" y2="${cy}" stroke="${C.you}" stroke-width="2"/>` +
      text(plotL, cy - 10, `Current CPA ${num(current, dec)} · تكلفة الليد الحالية`, { size: 19 });
  }
  body += text(W / 2, bottom + 62, "Net margin · هامش الربح", {
    size: 18,
    fill: C.muted,
    anchor: "middle",
  });
  body += legend(bottom + 100, [[C.series, "Profitable · مربح"], [C.other, "Loss · خسارة"], [
    C.you,
    "Current · الحالية",
  ]]);
  return frame(
    bottom + 165,
    "أقصى تكلفة ليد تقدر تدفعها",
    `Max cost per lead by margin · price ${num(d.price as Num, dec)} ${String(d.cur ?? "")}`,
    body,
  );
}

// ─── 3. market position ─────────────────────────────────────────────────────

const MAX_MARKET_ROWS = 12;

function marketChart(d: Record<string, unknown>): string {
  const dec = decimalsFor(d.cur);
  const all = (requireArray(d.comps, "comps") as [string, number][])
    .slice().sort((a, b) => a[1] - b[1]);
  const comps = all.slice(0, MAX_MARKET_ROWS);
  const you = d.you as Num;
  const be = d.breakeven as Num;
  const safe = d.safe as Num;
  const values = [...comps.map((c) => c[1]), you, be, safe].filter(isNum);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  const labelX = 250;
  const plotL = 280;
  const plotR = W - PAD - 30;
  const x = scale(lo - pad, hi + pad, plotL, plotR);
  const top = 190;
  const rowH = 48;
  const rows: { ar: string; en: string; v: number; color: string }[] = comps.map((c) => ({
    ar: c[0],
    en: "",
    v: c[1],
    color: C.other,
  }));
  if (isNum(you)) rows.push({ ar: "سعرك", en: "Your price", v: you, color: C.you });
  const bottom = top + rows.length * rowH;

  let body = "";
  const refLine = (v: Num, color: string, label: string, dy: number) =>
    isNum(v)
      ? `<line x1="${x(v)}" y1="${top - 20}" x2="${
        x(v)
      }" y2="${bottom}" stroke="${color}" stroke-width="2"/>` +
        text(x(v), top - 26 - dy, label, { size: 18, anchor: "middle" })
      : "";
  body += refLine(be, C.critical, `Breakeven ${num(be, dec)} · التعادل`, 0);
  body += refLine(safe, C.series, `Safe ${num(safe, dec)} · الآمن`, 24);
  rows.forEach((r, i) => {
    const mid = top + i * rowH + rowH / 2;
    body += `<line x1="${plotL}" y1="${mid}" x2="${plotR}" y2="${mid}" stroke="${C.grid}"/>`;
    body += r.en
      ? rowLabel(labelX, mid, r.ar, r.en)
      : text(labelX, mid + 7, r.ar.slice(0, 22), { size: 20, anchor: "end", rtl: true });
    body += `<circle cx="${x(r.v)}" cy="${mid}" r="${
      r.color === C.you ? 9 : 7
    }" fill="${r.color}" stroke="${C.surface}" stroke-width="2"/>`;
    body += text(x(r.v), mid - 13, num(r.v, dec), { size: 17, fill: C.muted, anchor: "middle" });
  });
  let h = bottom + 40;
  if (all.length > comps.length) {
    body += text(labelX, h, `+${all.length - comps.length} more · أكتر`, {
      size: 18,
      fill: C.muted,
      anchor: "end",
    });
    h += 30;
  }
  if (!isNum(be) || !isNum(safe)) {
    body += text(labelX, h, `— not available · غير متاح`, {
      size: 18,
      fill: C.muted,
      anchor: "end",
    });
    h += 30;
  }
  h += 30;
  return frame(
    h,
    "سعرك وسط المنافسين",
    `Your price vs competitors · per piece, ${String(d.cur ?? "")}`,
    body,
  );
}

// ─── 4. campaign funnel ─────────────────────────────────────────────────────

function funnelChart(d: Record<string, unknown>): string {
  const dec = decimalsFor(d.cur);
  const leads = isNum(d.leads) ? d.leads : 0;
  const stages: [string, string, number][] = [
    ["ليدز", "Leads", leads],
    ["مؤكد", "Confirmed", isNum(d.confirmed) ? d.confirmed : 0],
    ["اتسلّم واتدفع", "Delivered & paid", isNum(d.delivered) ? d.delivered : 0],
    ["مرتجع", "Returned", isNum(d.rto) ? d.rto : 0],
  ];
  const labelX = 250;
  const plotL = 270;
  const plotR = 640;
  const x = scale(0, Math.max(1, ...stages.map((s) => s[2])), plotL, plotR);
  const top = 120;
  const rowH = 60;
  let body = "";
  stages.forEach(([ar, en, v], i) => {
    const mid = top + i * rowH + rowH / 2;
    body += rowLabel(labelX, mid, ar, en);
    body += hbar(plotL, x(v), mid - 12, 24, i === 3 ? C.other : C.series);
    const share = leads > 0 && i > 0 ? ` (${((v / leads) * 100).toFixed(0)}%)` : "";
    body += text(x(v) + 10, mid + 8, `${num(v, 0)}${share}`, { size: 22 });
  });
  const net = d.net as Num;
  const y = top + stages.length * rowH + 40;
  const loss = isNum(net) && net < 0;
  body += `<rect x="${PAD}" y="${y - 18}" width="18" height="18" rx="4" fill="${
    loss ? C.critical : C.good
  }"/>`;
  body += text(PAD + 28, y - 2, `Net profit ${num(net, dec)} ${String(d.cur ?? "")}`, {
    size: 22,
    weight: 700,
  });
  body += text(PAD + 28, y + 24, isNum(net) ? (loss ? "Loss" : "Profit") : "—", {
    size: 18,
    fill: C.muted,
  });
  body += text(W - PAD, y - 2, `صافي الربح ${num(net, dec)}`, {
    size: 22,
    weight: 700,
    anchor: "end",
    rtl: true,
  });
  body += text(W - PAD, y + 24, isNum(net) ? (loss ? "خسارة" : "ربح") : "—", {
    size: 18,
    fill: C.muted,
    anchor: "end",
    rtl: true,
  });
  return frame(y + 70, "من الليد للأوردر المدفوع", "From lead to paid order", body);
}

// ─── 5. bundle and offer profits ────────────────────────────────────────────

function bundlesChart(d: Record<string, unknown>): string {
  const dec = decimalsFor(d.cur);
  const rows = requireArray(d.rows, "rows") as ["tier" | "offer", number, Num, Num][];
  const values = rows.map((r) => r[3]).filter(isNum);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values) || 1;
  const labelX = 250;
  const plotL = 270;
  const plotR = 640;
  const x = scale(lo, hi, plotL, plotR);
  const top = 120;
  const rowH = 58;
  let body = `<line x1="${x(0)}" y1="${top - 10}" x2="${x(0)}" y2="${
    top + rows.length * rowH
  }" stroke="${C.grid}"/>`;
  rows.forEach(([type, pieces, price, profit], i) => {
    const mid = top + i * rowH + rowH / 2;
    const ar = type === "offer" ? `عرض ${pieces} قطع بـ ${num(price, dec)}` : `باكدج ${pieces} قطع`;
    const en = type === "offer"
      ? `Offer: ${pieces} pcs for ${num(price, dec)}`
      : `Bundle: ${pieces} pcs @ ${num(price, dec)}`;
    body += rowLabel(labelX, mid, ar, en);
    const loss = isNum(profit) && profit < 0;
    if (isNum(profit)) body += hbar(x(0), x(profit), mid - 11, 22, loss ? C.critical : C.series);
    const end = isNum(profit) ? Math.max(x(profit), x(0)) : x(0);
    body += text(end + 10, mid + 8, `${num(profit, dec)}${loss ? "  Loss · خسارة" : ""}`, {
      size: 21,
    });
  });
  return frame(
    top + rows.length * rowH + 60,
    "ربح الأوردر في كل عرض",
    `Profit per order by offer · ${String(d.cur ?? "")}`,
    body,
  );
}

// ─── 6. price scenarios ─────────────────────────────────────────────────────

/** Profit per order at each candidate price, with the loss zone shaded. */
function scenariosChart(d: Record<string, unknown>): string {
  const dec = decimalsFor(d.cur);
  const rows = requireArray(d.rows, "rows") as [number, string, string, Num][];
  const profits = rows.map((r) => r[3]).filter(isNum);
  const lo = Math.min(0, ...profits);
  const hi = Math.max(0, ...profits) || 1;
  const labelX = 250;
  const plotL = 270;
  const plotR = 640;
  const x = scale(lo, hi, plotL, plotR);
  const top = 120;
  const rowH = 52;
  const bottom = top + rows.length * rowH;
  // Shade the loss side once, so "below this line you pay to sell" reads at a glance.
  let body = x(0) > plotL
    ? `<rect x="${plotL}" y="${top - 10}" width="${x(0) - plotL}" height="${
      bottom - top + 10
    }" fill="${C.critical}" opacity="0.07"/>`
    : "";
  body += `<line x1="${x(0)}" y1="${top - 10}" x2="${x(0)}" y2="${bottom}" stroke="${C.grid}"/>`;
  // Known row keys are words, not competitor names, so they get translated.
  const AR_WHO: Record<string, string> = {
    you: "إنت",
    breakeven: "سعر التعادل",
    suggested: "السعر المقترح",
    option: "خيار",
  };
  rows.forEach(([price, who, band, profit], i) => {
    const mid = top + i * rowH + rowH / 2;
    const isYou = who === "you";
    body += rowLabel(
      labelX,
      mid,
      `${num(price, dec)}  ${AR_WHO[who] ?? who}`,
      `${num(price, dec)}  ${who}`,
    );
    const loss = band === "LOSS";
    const fill = loss ? C.critical : isYou ? C.you : band === "HEALTHY" ? C.good : C.series;
    if (isNum(profit)) body += hbar(x(0), x(profit), mid - 10, 20, fill);
    const end = isNum(profit) ? Math.max(x(profit), x(0)) : x(0);
    const word: Record<string, string> = {
      LOSS: "Loss · خسارة",
      CRITICAL: "Thin · ضعيف جدًا",
      THIN: "Below target · تحت الهدف",
      HEALTHY: "Good · كويس",
    };
    body += text(end + 10, mid + 7, `${num(profit, dec)}  ${word[band] ?? ""}`, { size: 20 });
  });
  return frame(
    bottom + 60,
    "الربح في الأوردر عند كل سعر",
    `Profit per order at each price · ${String(d.cur ?? "")}`,
    body,
  );
}

const RENDERERS: Record<ChartKind, (d: Record<string, unknown>) => string> = {
  cost: costChart,
  cpa: cpaChart,
  market: marketChart,
  funnel: funnelChart,
  bundles: bundlesChart,
  scenarios: scenariosChart,
};

export function renderChart(kind: ChartKind, data: Record<string, unknown>): string {
  if (!data || typeof data !== "object") throw new TypeError("chart data must be an object");
  return RENDERERS[kind](data);
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

const SVG_HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=31536000, immutable",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
  "x-content-type-options": "nosniff",
};

/** Handles GET /chart/<kind>/<token>.svg; returns null when the path is not a chart path. */
export function handleChartRequest(req: Request, url: URL, secret: string): Response | null {
  if (!url.pathname.startsWith("/chart/")) return null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: { allow: "GET" } });
  }
  if (url.pathname.length > MAX_CHART_PATH) return new Response("too long", { status: 414 });
  const m = url.pathname.match(/^\/chart\/([a-z]+)\/([A-Za-z0-9_.-]+)\.svg$/);
  if (!m || !CHART_KINDS.includes(m[1] as ChartKind)) {
    return new Response("not found", { status: 404 });
  }
  const data = verifyChart(m[1], m[2], secret);
  if (data === null || typeof data !== "object") {
    return new Response("bad chart link", { status: 400 });
  }
  try {
    const svg = renderChart(m[1] as ChartKind, data as Record<string, unknown>);
    return new Response(req.method === "HEAD" ? null : svg, { headers: SVG_HEADERS });
  } catch {
    return new Response("bad chart data", { status: 400 });
  }
}
