/**
 * One-off migration: strip the grade token out of `skus.name`, catalog-wide.
 *
 * `composeSkuName` used to fold [subName, size, grade, factory] into the
 * display name (e.g. «آجدار ۱۰ A2 ظفر بناب»). It's since been changed to
 * drop grade — grade now lives in its own column on the public price table
 * and its own field in the admin SKU drawer, so folding it into a sentence
 * just meant a customer had to parse it back out, or the two could silently
 * drift apart. This is the one-time backfill for every row saved before that
 * change (formula-generated or hand-typed — both can contain the token).
 *
 * Deliberately surgical rather than "regenerate the whole name": for each
 * row with a non-empty `grade`, it removes exactly that grade string from
 * `name` as a whole word (word-boundary match, case-sensitive — grades are
 * Latin, e.g. A3/ST52), collapses the resulting double space, and also folds
 * any stray ASCII digits left in the name to Persian digits (a handful of
 * rows were saved with `10` instead of `۱۰`, inconsistent with every other
 * digit on the site). Nothing else about a hand-typed name is touched, so a
 * name that already reads however an admin wanted it — aside from the grade
 * — comes through unchanged.
 *
 * Requires scripts/mergeGradeSubcategories.ts to have run first: rebar's
 * "آجدار A3" sub-category name change is a prerequisite, otherwise the
 * grade this script strips from `name` would just come right back the next
 * time an admin re-saves the product (composeSkuName still starts from
 * `subName`).
 *
 * Safety:
 *   · dry run by default — pass --apply to write
 *   · one UPDATE per row, by primary key, setting only `name` + `updated_at`
 *   · full report is printed before any write
 *
 *   ./node_modules/.bin/tsx scripts/stripGradeFromSkuNames.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[strip-grade] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

// 01KZRAQ5PV26XF89XVS58TFZXK's `grade` column holds "میل 2000*1000" — a
// sheet thickness/dimension, not a real grade (an actual data-entry mistake
// found while writing this script). Stripping it from the name would
// destroy real information the name is the only place carrying, and it must
// not appear in a column titled «گرید» either — handled separately, not by
// this pass.
const EXCLUDE_IDS = new Set(['01KZRAQ5PV26XF89XVS58TFZXK']);

type Row = { id: string; name: string; grade: string | null };

const { rows: allRows } = await pool.query<Row>(
  `SELECT id, name, grade FROM skus WHERE grade IS NOT NULL AND grade <> '' ORDER BY id`,
);
const rows = allRows.filter((r) => !EXCLUDE_IDS.has(r.id));
if (allRows.length !== rows.length) {
  console.log(`[strip-grade] excluding ${allRows.length - rows.length} row(s) with a non-grade value in \`grade\` (see EXCLUDE_IDS).`);
}

console.log(`[strip-grade] ${rows.length} sku(s) with a grade set.\n`);

const ASCII_TO_PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function foldDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => ASCII_TO_PERSIAN_DIGITS[Number(d)]!);
}

const toUpdate: Array<{ id: string; oldName: string; newName: string }> = [];
let alreadyClean = 0;
let noGradeInName = 0;

for (const row of rows) {
  const grade = row.grade!.trim();
  const escaped = grade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const gradePattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);

  if (!gradePattern.test(row.name)) {
    noGradeInName += 1;
    continue;
  }

  const stripped = row.name.replace(gradePattern, '$1').replace(/\s{2,}/g, ' ').trim();
  const newName = foldDigits(stripped);

  if (newName === row.name) {
    alreadyClean += 1;
    continue;
  }

  toUpdate.push({ id: row.id, oldName: row.name, newName });
}

console.log(`[strip-grade] ${noGradeInName} row(s) — grade not found as a token in name (nothing to strip).`);
console.log(`[strip-grade] ${alreadyClean} row(s) already clean.`);
console.log(`[strip-grade] ${toUpdate.length} row(s) to fix:\n`);
for (const u of toUpdate) {
  console.log(`  · ${u.id}\n      "${u.oldName}"\n      → "${u.newName}"`);
}

if (!APPLY) {
  console.log(`\n[strip-grade] DRY RUN — no writes made. Re-run with --apply to write ${toUpdate.length} row(s).`);
  await pool.end();
  process.exit(0);
}

console.log(`\n[strip-grade] Applying ${toUpdate.length} update(s)...`);
for (const u of toUpdate) {
  await pool.query(`UPDATE skus SET name = $1, updated_at = now() WHERE id = $2`, [u.newName, u.id]);
}
console.log(`[strip-grade] Done. ${toUpdate.length} row(s) written.`);
await pool.end();
