// read_campaign_export: the seller pastes an ad-platform export; CODE reads the columns, never
// the model. Spec: specs/ad-account-sync.md §3 option A/plan B.
import { assert, assertEquals } from "@std/assert";
import { parseCampaignExport } from "../server/parse-export.ts";

// Meta Ads Manager, English, comma-separated, quoted campaign name containing a comma.
const META_EN = `Campaign name,Amount spent (EGP),Impressions,Link clicks,Results,Cost per result
"Summer sale, iron",1000.50,45000,1200,100,10.005
Backpack - retargeting,"2,340.00",88000,2100,156,15
Total,3340.50,133000,3300,256,13.05`;

// TikTok export, Arabic headers, tab-separated, Arabic-Indic digits.
const TIKTOK_AR = `اسم الحملة\tالمبلغ المصروف\tمرات الظهور\tالنقرات\tالنتائج
حملة المكواة\t١٢٥٠٫٧٥\t٣٠٠٠٠\t٩٠٠\t٦٥
حملة الشنطة\t٨٠٠\t٢٠٠٠٠\t٥٠٠\t٤٠`;

Deno.test("export: reads Meta's English CSV, including a quoted name and thousands separators", () => {
  const r = parseCampaignExport(META_EN);
  assertEquals(r.rows.length, 2, "the totals row is not a campaign");
  assertEquals(r.rows[0].campaign, "Summer sale, iron");
  assertEquals(r.rows[0].spend, 1000.5);
  assertEquals(r.rows[0].results, 100);
  assertEquals(r.rows[1].spend, 2340);
  assertEquals(r.rows[1].impressions, 88000);
  assertEquals(r.rows[1].clicks, 2100);
  assert(r.warnings.some((w) => w.code === "TOTAL_ROW_IGNORED"));
});

Deno.test("export: reads TikTok's Arabic tab export and Arabic-Indic digits", () => {
  const r = parseCampaignExport(TIKTOK_AR);
  assertEquals(r.rows.length, 2);
  assertEquals(r.rows[0].campaign, "حملة المكواة");
  assertEquals(r.rows[0].spend, 1250.75, "٫ is the Arabic decimal separator");
  assertEquals(r.rows[0].impressions, 30000);
  assertEquals(r.rows[1].spend, 800);
  assertEquals(r.rows[1].results, 40);
});

Deno.test("export: totals are summed in code and match the rows", () => {
  const r = parseCampaignExport(META_EN);
  assertEquals(r.totals.spend, 3340.5);
  assertEquals(r.totals.results, 256);
  assertEquals(r.totals.impressions, 133000);
  assertEquals(r.totals.clicks, 3300);
  // Summed, not read from the export's own total line.
  const summed = r.rows.reduce((a, x) => a + (x.spend ?? 0), 0);
  assertEquals(r.totals.spend, summed);
});

Deno.test("export: says which columns it found, and warns about the ones it needs", () => {
  const r = parseCampaignExport(META_EN);
  assertEquals(r.columnsFound.sort(), [
    "campaign",
    "clicks",
    "impressions",
    "results",
    "spend",
  ]);

  const noResults = parseCampaignExport(`Campaign name,Amount spent
Iron,500`);
  assert(noResults.warnings.some((w) => w.code === "NO_RESULTS_COLUMN"));
  assertEquals(noResults.rows[0].results, null, "missing is null, never zero");

  const noSpend = parseCampaignExport(`Campaign name,Results
Iron,50`);
  assert(noSpend.warnings.some((w) => w.code === "NO_SPEND_COLUMN"));
});

Deno.test("export: refuses text that isn't a table instead of inventing rows", () => {
  for (const junk of ["", "   ", "hello there", "just one line of prose with no delimiter"]) {
    const r = parseCampaignExport(junk);
    assertEquals(r.rows.length, 0, `junk: ${junk}`);
    assert(r.warnings.some((w) => w.code === "NO_TABLE_FOUND"), `junk: ${junk}`);
  }
});

Deno.test("export: a header row further down the file is still found", () => {
  const withPreamble = `Account: Hesba Demo
Date range: 2026-09-15 to 2026-09-21

Campaign name,Amount spent,Results
Iron,500,42`;
  const r = parseCampaignExport(withPreamble);
  assertEquals(r.rows.length, 1);
  assertEquals(r.rows[0].spend, 500);
  assertEquals(r.rows[0].results, 42);
});

Deno.test("export: semicolon files, currency symbols and stray percent signs", () => {
  const r = parseCampaignExport(`Campaign;Spend;Results;CTR
Iron;EGP 1.250,50;42;3,5%`);
  assertEquals(r.rows.length, 1);
  assertEquals(r.rows[0].spend, 1250.5, "European decimals with a currency prefix");
  assertEquals(r.rows[0].results, 42);
});

Deno.test("export: unreadable numbers become null with a warning, never a guess", () => {
  const r = parseCampaignExport(`Campaign name,Amount spent,Results
Iron,not available,42
Backpack,600,—`);
  assertEquals(r.rows[0].spend, null);
  assertEquals(r.rows[1].results, null);
  assert(r.warnings.some((w) => w.code === "UNREADABLE_VALUES"));
  assertEquals(r.totals.spend, 600, "totals skip what could not be read");
});

Deno.test("export: caps very large pastes", () => {
  const many = ["Campaign name,Amount spent,Results"];
  for (let i = 0; i < 500; i++) many.push(`Campaign ${i},10,1`);
  const r = parseCampaignExport(many.join("\n"));
  assertEquals(r.rows.length, 200);
  assert(r.warnings.some((w) => w.code === "ROWS_TRUNCATED"));
});

Deno.test("export: repeats the campaign names back so the seller can confirm", () => {
  const r = parseCampaignExport(META_EN);
  assertEquals(r.rows.map((x) => x.campaign), ["Summer sale, iron", "Backpack - retargeting"]);
});
