/**
 * Reads an ad-platform export (Meta, TikTok, Google — pasted or uploaded) into numbers.
 *
 * The model never transcribes figures: this code finds the header row, maps columns by their
 * Arabic or English names, and parses each cell. Anything it cannot read becomes `null` with a
 * warning, never a guess. The agent repeats the parsed rows back for a "yes" before any
 * calculation runs.
 */

export type ExportWarningCode =
  | "NO_TABLE_FOUND"
  | "NO_SPEND_COLUMN"
  | "NO_RESULTS_COLUMN"
  | "TOTAL_ROW_IGNORED"
  | "UNREADABLE_VALUES"
  | "ROWS_TRUNCATED";

export interface ExportWarning {
  code: ExportWarningCode;
  detail?: Record<string, string | number>;
}

export interface ExportRow {
  campaign: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  results: number | null;
}

export interface ExportResult {
  rows: ExportRow[];
  totals: { spend: number; impressions: number; clicks: number; results: number };
  columnsFound: string[];
  warnings: ExportWarning[];
}

const MAX_ROWS = 200;
const MAX_CHARS = 20_000;

/** Column names seen in Meta, TikTok and Google exports, English and Arabic. */
const HEADERS: Record<keyof Omit<ExportRow, never>, string[]> = {
  campaign: ["campaign name", "campaign", "ad group name", "اسم الحملة", "الحملة", "الحملات"],
  spend: [
    "amount spent",
    "spend",
    "cost",
    "total spent",
    "المبلغ المصروف",
    "المبلغ المنفق",
    "الإنفاق",
    "التكلفة",
    "المصروف",
  ],
  impressions: ["impressions", "impr.", "impr", "مرات الظهور", "الظهور", "المشاهدات"],
  clicks: ["link clicks", "clicks", "النقرات", "نقرات الرابط", "الضغطات"],
  results: [
    "results",
    "conversions",
    "leads",
    "conversion",
    "total results",
    "النتائج",
    "التحويلات",
    "العملاء المحتملين",
    "الطلبات",
  ],
};

const TOTAL_WORDS = ["total", "totals", "grand total", "الإجمالي", "المجموع", "الاجمالي"];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[:：]$/, "");

/** Splits one delimited line, honouring "quoted, fields". */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delim && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, "").trim());
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Parses one cell into a number, or null when it isn't one.
 * Handles Arabic-Indic digits, the Arabic decimal separator, thousands separators in both the
 * English (1,234.50) and European (1.234,50) styles, currency words and symbols, and percents.
 */
export function parseNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  // Arabic-Indic digits and separators.
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
  // Strip anything that isn't part of a number (currency codes, symbols, %, spaces, RTL marks).
  s = s.replace(/[^\d.,\-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // A single comma: decimal separator when it isn't a thousands group (1,250 vs 1,25).
    const after = s.length - lastComma - 1;
    s = after === 3 && s.indexOf(",") === lastComma && /^\d{1,3},\d{3}$/.test(s)
      ? s.replace(",", "")
      : s.replace(/,(?=.*,)/g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Picks the delimiter that actually produces a readable header, not merely one that splits the
 * line: a semicolon file whose cells contain "1.250,50" would otherwise look comma-separated.
 */
function detectTable(
  lines: string[],
): { delim: string; header: Record<string, number>; at: number } | null {
  let best: { delim: string; header: Record<string, number>; at: number; score: number } | null =
    null;
  for (const delim of ["\t", ";", ","]) {
    for (let i = 0; i < lines.length && i < 50; i++) {
      const cells = splitLine(lines[i], delim);
      if (cells.length < 2) continue;
      const header = mapHeader(cells);
      if (!header) continue;
      // More recognised columns wins; an earlier header breaks a tie.
      const score = Object.keys(header).length * 100 - i;
      if (!best || score > best.score) best = { delim, header, at: i, score };
      break;
    }
  }
  return best ? { delim: best.delim, header: best.header, at: best.at } : null;
}

/** Maps a header line to column indexes; returns null when too few known columns are present. */
function mapHeader(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((cell, i) => {
    const c = norm(cell);
    for (const [field, names] of Object.entries(HEADERS)) {
      if (map[field] !== undefined) continue;
      // "Amount spent (EGP)" should still match "amount spent".
      const bare = c.replace(/\s*[([].*$/, "").trim();
      if (names.some((n) => bare === n || c === n || bare.startsWith(n))) map[field] = i;
    }
  });
  const hasName = map.campaign !== undefined;
  const hasNumber = ["spend", "impressions", "clicks", "results"].some((k) => map[k] !== undefined);
  return hasName && hasNumber ? map : null;
}

export function parseCampaignExport(text: string): ExportResult {
  const warnings: ExportWarning[] = [];
  const empty: ExportResult = {
    rows: [],
    totals: { spend: 0, impressions: 0, clicks: 0, results: 0 },
    columnsFound: [],
    warnings,
  };
  if (!text || !text.trim()) {
    warnings.push({ code: "NO_TABLE_FOUND" });
    return empty;
  }
  const clipped = text.slice(0, MAX_CHARS);
  const lines = clipped.split(/\r?\n/).filter((l) => l.trim());
  const table = detectTable(lines);
  if (!table) {
    warnings.push({ code: "NO_TABLE_FOUND" });
    return empty;
  }
  const { delim, header, at: headerAt } = table;

  const rows: ExportRow[] = [];
  let unreadable = 0;
  let totalRows = 0;
  let truncated = false;
  const cell = (cells: string[], field: string) => {
    const i = header[field];
    return i === undefined ? undefined : cells[i];
  };

  for (let i = headerAt + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const name = (cell(cells, "campaign") ?? "").trim();
    if (!name) continue;
    if (TOTAL_WORDS.includes(norm(name))) {
      totalRows++;
      continue;
    }
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const num = (field: string): number | null => {
      const raw = cell(cells, field);
      if (raw === undefined) return null;
      const v = parseNumber(raw);
      if (v === null && raw.trim()) unreadable++;
      return v;
    };
    rows.push({
      campaign: name,
      spend: num("spend"),
      impressions: num("impressions"),
      clicks: num("clicks"),
      results: num("results"),
    });
  }

  const sum = (field: keyof ExportRow) =>
    rows.reduce((a, r) => a + (typeof r[field] === "number" ? (r[field] as number) : 0), 0);

  if (header.spend === undefined) warnings.push({ code: "NO_SPEND_COLUMN" });
  if (header.results === undefined) warnings.push({ code: "NO_RESULTS_COLUMN" });
  if (totalRows) warnings.push({ code: "TOTAL_ROW_IGNORED", detail: { rows: totalRows } });
  if (unreadable) warnings.push({ code: "UNREADABLE_VALUES", detail: { cells: unreadable } });
  if (truncated) warnings.push({ code: "ROWS_TRUNCATED", detail: { kept: MAX_ROWS } });
  if (rows.length === 0) warnings.push({ code: "NO_TABLE_FOUND" });

  return {
    rows,
    totals: {
      spend: sum("spend"),
      impressions: sum("impressions"),
      clicks: sum("clicks"),
      results: sum("results"),
    },
    columnsFound: Object.keys(header),
    warnings,
  };
}
