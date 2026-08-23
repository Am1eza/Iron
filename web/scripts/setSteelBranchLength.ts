/**
 * One-off, re-runnable data fix for the استیل category: record the 6-metre
 * branch length every one of its products is actually sold in, and take the
 * country of origin back out of the names it was folded into.
 *
 * ## Why
 *
 * The owner's employer, 1405/06: «برای استیل‌ها چون که وارداتی هست باید کلاک
 * کارخانه رو حذف بکنیم، فقط محصول رو می‌ذاریم، آلیاژش رو می‌نویسیم و طولش رو».
 * The code half of that ships alongside this script — `factoryIsMeaningful`
 * now withholds `skus.factory` for the whole category (it held «چین» on every
 * نبشی row and «تایوان» on every ناودانی row: a country of ORIGIN, never a
 * mill), and `attrKeysFor` publishes «طول شاخه» beside «آلیاژ». This is the
 * data half: without it the new column would read «نامشخص» on all 55 rows,
 * because `branch_length_m` is NULL for every single one of them.
 *
 * ## Why 6 metres, and why that is not a guess
 *
 * 6 m is the standard bar length for imported stainless structural shapes.
 * Cross-checked against steelrokh.com (1405/06), which publishes exactly this
 * product class in exactly this shape — نام محصول / آلیاژ / سایز / ضخامت /
 * طول / وزن شاخه / واحد / قیمت, with no factory column at all — and lists 6 m
 * for every نبشی استنلس size and thickness it carries, with no exception, and
 * for لوله استیل likewise. It is the one length in the trade for this family.
 *
 * That is evidence about the PRODUCT CLASS, not per-SKU confirmation, so this
 * script does not force it. Two guards keep it honest:
 *
 *   1. An explicit sub-category allow-list — نبشی/ناودانی/لوله/پروفیل, the
 *      four subs that hold stock. استیل's other, currently-empty subs (فلنج،
 *      مش، رینگ، فنر، تسمه، تیوب، توری) are stainless but NOT bars: a flange
 *      and a ring have no branch length at all, and «۶ متر» on one would be a
 *      fabricated spec. They are skipped by construction, today and the day
 *      they get stock.
 *   2. Per-row: anything whose recorded shape contradicts a straight bar is
 *      skipped and REPORTED, never overwritten — a coil/sheet/plate word in
 *      the name, a `price_basis`/`unit` of کلاف/برگ/متر مربع, or a
 *      `branch_length_m` that is already set (an admin's own number always
 *      wins; the script only ever fills a hole).
 *
 * `theoretical_weight_kg` is deliberately NOT computed from the new length.
 * The rule this repo settled on (1405/05, after 185 wrong weights) is that a
 * weight is written only when the section table AND the branch length are
 * both published, and there is no section table for imported stainless — so
 * these rows keep their empty weight until someone has real numbers.
 *
 * ## The names
 *
 * Eleven rows carry the origin in the display name itself («نبشی استیل ۲۰×۲۰
 * چین», «ناودانی استیل ۱۰ تایوان») — `composeSkuName` folds the factory in,
 * and «چین» was sitting in that field. Withholding the column cannot reach a
 * word baked into the name, so the same instruction removes it here: exactly
 * the trailing origin token, as a whole word, off the end of the name only.
 * Nothing else about a name is touched.
 *
 * `skus.slug` is deliberately left alone (`…-304-chyn`, `…-304l-tayvan`). A
 * slug is a URL, not a label: renaming eleven of them would 404 every
 * indexed product page and every link into it, to fix a string no visitor
 * ever reads. The stored `skus.factory` is likewise untouched — suppressed at
 * the DTO boundary, exactly as for the پروفیل subs, so the raw rows stay
 * queryable for audit.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one transaction; the full report is printed before it
 *   · every write is by primary key, setting only the one column + updated_at
 *   · idempotent: a second run recomputes from the database and finds nothing
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/setSteelBranchLength.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[steel-length] DATABASE_URL is not set.');
  process.exit(1);
}

const CATEGORY = 'steel';
const LENGTH_M = 6;

/** The استیل subs that are sold as straight bars. See the header. */
const BAR_SUBS = new Set(['angle', 'channel', 'pipe', 'profile']);

/** Words that mean "this is not a bar" wherever they appear in a name. Only
 *  shapes a bar can be confused with — the fittings (فلنج، رینگ، فنر) are
 *  excluded by `BAR_SUBS` instead, so no short token here can match inside an
 *  unrelated Persian word. */
const NOT_A_BAR = /کلاف|رول|ورق|صفحه|شیت/;

/** Denominations that cannot belong to a fixed-length bar. */
const NOT_A_BAR_BASIS = new Set(['coil', 'sheet', 'sqm']);

/** The origin tokens folded into a display name by `composeSkuName`. */
const ORIGIN_TOKENS = ['چین', 'تایوان'];

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  name: string;
  slug: string;
  sub: string;
  size: string | null;
  dimensions: string | null;
  factory: string | null;
  unit: string;
  price_basis: string | null;
  branch_length_m: string | number | null;
  theoretical_weight_kg: string | number | null;
};

const { rows } = await pool.query<Row>(
  `SELECT k.id, k.name, k.slug, sc.slug AS sub, k.size, k.dimensions, k.factory,
          k.unit::text AS unit, k.price_basis::text AS price_basis,
          k.branch_length_m, k.theoretical_weight_kg
     FROM skus k
     JOIN sub_categories sc ON sc.id = k.sub_category_id
     JOIN categories c ON c.id = k.category_id
    WHERE c.slug = $1 AND k.is_active
    ORDER BY sc.slug, k.name`,
  [CATEGORY],
);

if (rows.length === 0) {
  console.error(`[steel-length] no active SKUs under «${CATEGORY}» — aborting rather than guessing.`);
  await pool.end();
  process.exit(1);
}

/** Why a row is not getting a length, or null when it is. */
function skipReason(r: Row): string | null {
  if (!BAR_SUBS.has(r.sub)) return `sub «${r.sub}» is not a bar section — no branch length applies`;
  if (r.branch_length_m != null) return `already has branch_length_m = ${r.branch_length_m}`;
  if (NOT_A_BAR.test(r.name)) return `name reads as a coil/sheet/fitting, not a bar: «${r.name}»`;
  if (r.price_basis && NOT_A_BAR_BASIS.has(r.price_basis)) return `price_basis = ${r.price_basis}`;
  if (NOT_A_BAR_BASIS.has(r.unit)) return `unit = ${r.unit}`;
  return null;
}

/** The name with the trailing origin token removed, or null when it has none. */
function strippedName(name: string): string | null {
  for (const token of ORIGIN_TOKENS) {
    // End-anchored and whole-word: only the token `composeSkuName` appended,
    // never an occurrence inside a real product word.
    const re = new RegExp(`[\\s\\u200c]+${token}\\s*$`);
    if (re.test(name)) return name.replace(re, '').trim();
  }
  return null;
}

const lengthWrites: Row[] = [];
const lengthSkips: { r: Row; why: string }[] = [];
for (const r of rows) {
  const why = skipReason(r);
  if (why) lengthSkips.push({ r, why });
  else lengthWrites.push(r);
}

const nameWrites = rows
  .map((r) => ({ r, next: strippedName(r.name) }))
  .filter((x): x is { r: Row; next: string } => x.next != null);

console.log(`\n[steel-length] «${CATEGORY}»: ${rows.length} active SKUs.\n`);

console.log(`── طول شاخه = ${LENGTH_M} m — ${lengthWrites.length} row(s) ─────────────`);
for (const r of lengthWrites) {
  console.log(`  ${r.sub.padEnd(8)} ${r.name}  (size ${r.size ?? '—'}, basis ${r.price_basis ?? '—'})`);
}
console.log(`\n── skipped — ${lengthSkips.length} row(s) ─────────────`);
for (const { r, why } of lengthSkips) console.log(`  ${r.sub.padEnd(8)} ${r.name}: ${why}`);

console.log(`\n── name: origin removed — ${nameWrites.length} row(s) ─────────────`);
for (const { r, next } of nameWrites) console.log(`  «${r.name}» → «${next}»  (slug ${r.slug} unchanged)`);

if (!APPLY) {
  console.log('\n[steel-length] DRY RUN — nothing written. Re-run with --apply.\n');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const r of lengthWrites) {
    await client.query(`UPDATE skus SET branch_length_m = $2, updated_at = now() WHERE id = $1`, [
      r.id,
      LENGTH_M,
    ]);
  }
  for (const { r, next } of nameWrites) {
    await client.query(`UPDATE skus SET name = $2, updated_at = now() WHERE id = $1`, [r.id, next]);
  }
  await client.query('COMMIT');
  console.log(
    `\n[steel-length] applied: ${lengthWrites.length} length(s), ${nameWrites.length} name(s).\n`,
  );
} catch (e) {
  await client.query('ROLLBACK');
  console.error('[steel-length] rolled back:', e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
