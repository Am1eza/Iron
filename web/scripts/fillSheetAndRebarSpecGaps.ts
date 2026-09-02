/**
 * Spec-completeness fills — the 13 gap cells that a source actually publishes.
 *
 *   ./node_modules/.bin/tsx scripts/fillSheetAndRebarSpecGaps.ts
 *   ./node_modules/.bin/tsx scripts/fillSheetAndRebarSpecGaps.ts --apply
 *
 * Same safety contract as `alignCatalogSafeFields.ts`, which this is modelled
 * on: dry-run by default, exact slug/old-value guards that abort on drift,
 * one transaction with the guards re-checked under `FOR UPDATE`, idempotent
 * (the target value is an allowed old value, so a second run is a no-op).
 * `--apply` additionally writes every affected row, as it stands before the
 * update, to `scripts/.backups/fillSheetAndRebarSpecGaps-<n>.json`.
 *
 * Only `grade` and `condition` are in the UPDATE's column list. Prices, price
 * history, units, `price_basis`, activation, slugs and URLs are not selected
 * for update and cannot change here.
 *
 * Where these 13 rows came from
 * =============================
 * `scripts/specCoverageReport.ts` (1405/06/10 = 2026-08-31) measured what a
 * buyer reads as «نامشخص» on a live price table — not what a null scan says —
 * and found 83 such cells across 19 sub×field combinations. Each one was then
 * checked against the sources below. These 13 are the ones where a source
 * publishes the value for our exact product; the other 70 are documented in
 * `src/lib/utils/catalogLabels.ts` either as a column reading the wrong stored
 * field (لوله جدار چاه, مانیسمان — fixed there, no data change) or as
 * genuinely unpublished market-wide (the لوله/پروفیل/مفتول lines).
 *
 * All pages fetched 2026-08-31. Persian-slug URLs are given decoded.
 *
 * 1. میلگرد ساده فولاد متین ۲۰ / ۲۲ / ۲۵ → grade «A1»  (3 rows)
 * ---------------------------------------------------------------
 * The one partial gap in the audit: 19 of this sub's 22 live rows already
 * carry «A1», including فولاد متین's own ۱۰/۱۲/۱۴/۱۶/۱۸ and کویر کاشان's own
 * ۲۰/۲۲/۲۵. These three are the unscraped remainder of a product line the
 * catalogue has already classified, and three independent sources agree that
 * A1 is what میلگرد ساده is:
 *   * markazeahan.com/product-category/میلگرد-ساده — an explicit «آنالیز»
 *     column reading **A1** on every row of every table (48 occurrences, zero
 *     other values), «نوع» = «ساده», sizes 10 through 90 including 20, 22
 *     and 25.
 *   * ahanonline.com/product-category/میلگرد/میلگرد-ساده («تاریخ بروزرسانی»
 *     1405/6/7) — its «میلگرد ساده فولاد متین» table names the grade in the
 *     product title, «میلگرد ساده 10 فولاد متین شاخه 6 متری A1 بنگاه تهران»,
 *     for 10/12/14. It has no grade column, so its 16–25 titles omit it —
 *     which is why this needed corroboration rather than being taken alone.
 *   * teleahan.com/product-category/میلگرد/میلگرد-ساده — A1 throughout.
 *     kilooton.com/catalog/roundbar agrees (A1 on the plain rows; its ST37
 *     rows are one different mill, «نوین متین», and its CK45 rows are the
 *     separate «حرارت‌پذیر» heat-treatable variant, neither of which is a
 *     فولاد متین plain bar).
 * A2/A3 are by definition ribbed grades and cannot apply to a ساده bar, so
 * there is no competing value to weigh.
 *
 * 2. ورق اسیدشویی فولاد مبارکه ۲ / ۲.۵ / ۳ / ۳.۵ / ۴ → condition «رول» (5)
 * -------------------------------------------------------------------------
 * SKU-level, not extrapolated — same mill and same thicknesses on both
 * price-publishing sources:
 *   * ahanonline.com/product-category/انواع-ورق/ورق-اسید-شوئی — all 10 priced
 *     rows are فولاد مبارکه and every `data-name` reads «… فولاد مبارکه <عرض>
 *     رول بنگاه تهران», at 2, 2.5, 3, 3.5 and 4 mm. («استاندارد» = W22 there
 *     is the value our rows already store in `skus.standard`.)
 *   * kilooton.com/catalog/coil-pickled — the catalogue is literally named
 *     «ورق اسیدشویی رول»; its form column reads «رول» on every row, for
 *     مبارکه at 2, 2.5, 3 and 4 mm.
 * Known caveat, recorded rather than hidden:
 * teleahan.com/product-category/ورق/ورق-گرم/ورق-اسید-شویی says in prose
 * «حالت: رول، شیت، برش لیزری» — cut forms can be ordered. It publishes no
 * per-row حالت, so it does not contradict what the two priced sources
 * publish; «رول» is the form the market quotes a price for, which is the
 * form this catalogue quotes a price for.
 *
 * 3. ورق روغنی ۱ / ۱.۵ / ۲ → condition «رول»  (3 rows)
 * -----------------------------------------------------
 *   * ahanonline.com/product-category/انواع-ورق/ورق-روغنی — 57 priced rows
 *     across فولاد مبارکه, هفت الماس and فولاد غرب; every `data-name` reads
 *     «… رول … ST12 …». No counterexample.
 *   * markazeahan.com/product-category/قیمت-ورق-روغنی — an explicit «حالت»
 *     column reading «رول» on every row of all three mill tables, at 0.7
 *     through 2.5 mm.
 *   * kilooton.com/catalog/coil-oil — form column «رول» on every row.
 * `sheet-oiled-6` (فولاد مبارکه ۱.۵) matches a published row by mill and
 * thickness. `sheet-oiled-5` (کاویان اهواز ۱) and `sheet-oiled-7` (امیرکبیر
 * کاشان ۲) do not: no source lists a روغنی coil from either mill — کاویان
 * اهواز rolls heavy plate, and that row is a seed artefact. The value written
 * is therefore the product-line fact, uniform across 100% of the ~130 priced
 * روغنی rows on three sources with zero counterexamples, not a per-mill
 * lookup. Stated here so it is not mistaken for the stronger evidence above.
 *
 * 4. ورق گالوانیزه ۲.۵ / ۳ → condition «رول»  (2 rows)
 * -----------------------------------------------------
 *   * ahanonline.com/product-category/انواع-ورق/ورق-گالوانیزه — every priced
 *     row's `data-name` reads «… رول عرض <عرض>», including «ورق گالوانیزه
 *     ضخامت 2.5 میل شهریار تبریز رول عرض 1250», our 2.5 mm thickness. The
 *     page's own FAQ states it outright: «قيمت‌ها معمولا برای رول».
 *   * markazeahan.com/product-category/انواع-ورق-سرد — «حالت» column «رول» on
 *     every row of every mill table.
 *   * kilooton.com/catalog/coil-galvanized — form column «رول» throughout,
 *     including for امیرکبیر کاشان, the mill on `sheet-galvanized-12`.
 * Caveat, flagged for the owner rather than resolved here:
 * `sheet-galvanized-12` is 3 mm, and no source publishes a galvanized coil
 * thicker than 2.5 mm (kilooton stops at 2, markazeahan at 1.2, ahanonline at
 * 2.5). Its حالت is written from the product-line fact like the روغنی rows
 * above; whether a 3 mm galvanized SKU should exist at all is a catalogue
 * question, not a spec-completeness one, and nothing here changes its
 * activation.
 */
import fs from 'node:fs';
import path from 'node:path';

import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[spec-fill] DATABASE_URL is not set.');
  process.exit(1);
}

type MutableField = 'grade' | 'condition';
type Value = string | null;
type Plan = {
  slug: string;
  reason: string;
  set: Partial<Record<MutableField, Value>>;
  /** Allowed values before the migration, including the target for reruns. */
  allow: Partial<Record<MutableField, readonly Value[]>>;
};

const plan: Plan[] = [];

for (const slug of [
  'rebar-plain-20-fvlad-mtyn',
  'rebar-plain-22-fvlad-mtyn',
  'rebar-plain-25-fvlad-mtyn',
]) {
  plan.push({
    slug,
    reason: 'A1 — markazeahan «آنالیز» column, all sizes; 19/22 siblings already A1',
    set: { grade: 'A1' },
    allow: { grade: [null, 'A1'] },
  });
}

for (const slug of [
  'sheet-pickled-2-fvlad-mbarkh',
  'sheet-pickled-2-5-fvlad-mbarkh',
  'sheet-pickled-3-fvlad-mbarkh',
  'sheet-pickled-3-5-fvlad-mbarkh',
  'sheet-pickled-4-fvlad-mbarkh',
]) {
  plan.push({
    slug,
    reason: 'رول — ahanonline + kilooton, same mill and thickness',
    set: { condition: 'رول' },
    allow: { condition: [null, 'رول'] },
  });
}

for (const slug of ['sheet-oiled-5', 'sheet-oiled-6', 'sheet-oiled-7']) {
  plan.push({
    slug,
    reason: 'رول — ahanonline + markazeahan «حالت» + kilooton, no counterexample',
    set: { condition: 'رول' },
    allow: { condition: [null, 'رول'] },
  });
}

for (const slug of ['sheet-galvanized-11', 'sheet-galvanized-12']) {
  plan.push({
    slug,
    reason: 'رول — ahanonline (incl. its «قيمت‌ها … برای رول» FAQ) + markazeahan + kilooton',
    set: { condition: 'رول' },
    allow: { condition: [null, 'رول'] },
  });
}

type Row = {
  id: string;
  slug: string;
  name: string;
  sub: string;
  grade: string | null;
  condition: string | null;
};

const SELECT = `SELECT s.id, s.slug, s.name, sc.slug AS sub, s.grade, s.condition
                  FROM skus s
                  JOIN sub_categories sc ON sc.id = s.sub_category_id
                 WHERE s.slug = ANY($1)
                 ORDER BY s.slug`;

const slugs = plan.map((p) => p.slug);
const pool = new pg.Pool({ connectionString: url, max: 1 });

const { rows } = await pool.query<Row>(SELECT, [slugs]);
const bySlug = new Map(rows.map((row) => [row.slug, row]));
const missing = plan.filter((item) => !bySlug.has(item.slug));
if (missing.length) {
  console.error(`[spec-fill] ABORT — ${missing.length} expected slug(s) missing:`);
  for (const item of missing) console.error(`  ${item.slug}`);
  await pool.end();
  process.exit(1);
}

const guard = (item: Plan, row: Row): string | null => {
  for (const [field, allowed] of Object.entries(item.allow) as Array<
    [MutableField, readonly Value[]]
  >) {
    if (!allowed.includes(row[field])) {
      return `${item.slug}.${field} is ${JSON.stringify(row[field])}; expected one of ${JSON.stringify(allowed)}.`;
    }
  }
  return null;
};

const changed = (item: Plan, row: Row): boolean =>
  (Object.entries(item.set) as Array<[MutableField, Value]>).some(
    ([field, value]) => row[field] !== value,
  );

for (const item of plan) {
  const problem = guard(item, bySlug.get(item.slug)!);
  if (problem) {
    console.error(`[spec-fill] ABORT — ${problem}`);
    await pool.end();
    process.exit(1);
  }
}

const changes = plan.filter((item) => changed(item, bySlug.get(item.slug)!));

console.log(`[spec-fill] ${plan.length} guarded SKU(s); ${changes.length} to change.\n`);
for (const item of changes) {
  const row = bySlug.get(item.slug)!;
  const fields = (Object.entries(item.set) as Array<[MutableField, Value]>)
    .filter(([field, value]) => row[field] !== value)
    .map(([field, value]) => `${field}: ${JSON.stringify(row[field])} → ${JSON.stringify(value)}`)
    .join(', ');
  console.log(`  ${item.slug}  ${fields}  (${item.reason})`);
}

if (!changes.length) {
  console.log('[spec-fill] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}
if (!APPLY) {
  console.log('\n[spec-fill] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Re-read and lock every target after BEGIN. The dry-run snapshot above is
  // useful output but not authority to write: an admin or the price-sync job
  // may have edited a row in between. Re-running the same old-value guards
  // under row locks aborts on that drift instead of overwriting it silently.
  const { rows: locked } = await client.query<Row>(`${SELECT}\n FOR UPDATE OF s`, [slugs]);
  const lockedBySlug = new Map(locked.map((row) => [row.slug, row]));
  if (lockedBySlug.size !== plan.length) {
    throw new Error(
      `[spec-fill] ABORT — target count changed before lock (${lockedBySlug.size}/${plan.length}).`,
    );
  }
  for (const item of plan) {
    const problem = guard(item, lockedBySlug.get(item.slug)!);
    if (problem) throw new Error(`[spec-fill] ABORT — locked ${problem}`);
  }

  const lockedChanges = plan.filter((item) => changed(item, lockedBySlug.get(item.slug)!));

  // The pre-image of every row this transaction will touch, on disk before the
  // first UPDATE. The transaction is the real safety net; this is for the
  // morning after, when the question is what a cell used to hold.
  const dir = path.join(import.meta.dirname, '.backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `fillSheetAndRebarSpecGaps-${lockedChanges.length}.json`);
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      lockedChanges.map((item) => lockedBySlug.get(item.slug)!),
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`\n[spec-fill] pre-image of ${lockedChanges.length} row(s) written to ${file}`);

  for (const item of lockedChanges) {
    const row = lockedBySlug.get(item.slug)!;
    const next = { ...row, ...item.set };
    await client.query(
      `UPDATE skus SET grade = $2, condition = $3, updated_at = now() WHERE id = $1`,
      [row.id, next.grade, next.condition],
    );
  }
  await client.query('COMMIT');
  console.log(
    `[spec-fill] APPLIED — ${lockedChanges.length} SKU(s) updated; no price, unit or URL field touched.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
