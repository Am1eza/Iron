/**
 * One-off catalog fill: کوپلر میلگرد (`rebar/coupler`), from ahanonline.
 *
 * This sub-category has been live and empty since it was activated, showing a
 * «به‌زودی در این دسته» state to real visitors. The 2026-08-19 price pass
 * scraped all 65 of ahanonline's coupler rows but could not load them: every
 * one is priced per «عدد» and `PRICE_UNITS` had no piece unit, so writing them
 * as `branch` would have rendered «شاخه کوپلر» AND — because a `branch` price
 * is per KILOGRAM in this codebase — priced each line by a weight a coupler
 * does not have. `'piece'` is added in the same change as this script.
 *
 * ## Source
 *
 * `.claude/audits/ahanonline-price-fix-2026-08-19/ahanonline_b.json`, rows
 * keyed `rebar/coupler` — ahanonline's own کوپلر category page, «واحد: عدد» on
 * all 65 rows, «تاریخ بروزرسانی 1405/5/27».
 *
 * Re-verified live against that page while writing this script: the served
 * HTML still carries 86,250 / 96,600 / 127,650 / 158,700 / 201,250 / 264,500 /
 * 322,000 for کوپلر میانی استاندارد ۲۰…۴۰, i.e. the saved numbers unchanged.
 * The «احتساب ارزش افزوده» checkbox in that HTML is NOT `checked`, so the
 * served figure is ex-VAT — matching `vat_included = false` on all 543 rows
 * the previous pass wrote.
 *
 * ## Modelling decisions
 *
 * - **`unit = 'piece'`, `theoretical_weight_kg = NULL`.** A coupler is a
 *   threaded sleeve sold by the piece; it has no branch weight, and inventing
 *   one would feed `leads.service`'s kg conversion. `priceItems` prices a
 *   piece line as `qty × unitPrice` with no weight in the chain.
 * - **The نوع goes in the NAME, not in `grade`.** «گرید» in this catalog means
 *   A2/A3/ST37 and the میلگرد price table already renders that column;
 *   dropping «میانی استاندارد» into it would put two unrelated vocabularies in
 *   one column. «کوپلر میانی استاندارد ۲۰» is also exactly how ahanonline
 *   names the row, so the customer reads the same string on both sites.
 * - **`factory = NULL`.** ahanonline publishes no برند on this page. Guessing
 *   a mill would attribute a price to a company that never quoted it.
 * - **کوپلر تبدیل keeps its range size** («۱۶-۱۸»): a reducing coupler joins
 *   two different bar sizes and that IS its size.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · skips any SKU whose slug already exists, so it is safe to re-run
 *   · every `current_prices` row gets a matching `price_points` row, or the
 *     chart/نوسان history is left dangling
 *
 *     ./node_modules/.bin/tsx scripts/seedCouplers.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { ulid } from 'ulid';
import { toPersianDigits } from '../src/lib/utils/format';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[couplers] DATABASE_URL is not set.');
  process.exit(1);
}

const SOURCE =
  '/opt/ahantime/.claude/audits/ahanonline-price-fix-2026-08-19/ahanonline_b.json';

/** `current_prices.delivery_time`'s own column default, and what the previous
 *  pass wrote on every new row — there is no per-category convention. */
const DELIVERY_TIME = '۲۴ ساعت';

/** ahanonline's نوع → a stable ASCII slug segment. Fixed rather than derived:
 *  a transliteration of «میانی استاندارد» is unreadable, and these seven are
 *  the whole set that page publishes. */
const TYPE_SLUG: Record<string, string> = {
  'کوپلر میانی استاندارد': 'standard',
  'کوپلر تبدیل': 'reducer',
  'کوپلر انتهایی': 'end',
  'کوپلر یک طرف جوش': 'one-side-weld',
  'کوپلر جوشی سازه': 'structural-weld',
  'کوپلر بغل پیچ': 'side-bolt',
  'کوپلر رزوه زنی میلگرد': 'threading',
};

type SourceRow = {
  key: string;
  group: string;
  code: string;
  price_toman: number;
  'c_سایز': string;
  'c_واحد': string;
};

const raw: SourceRow[] = JSON.parse(await readFile(SOURCE, 'utf8'));
const rows = raw.filter((r) => r.key === 'rebar/coupler');
console.log(`[couplers] ${rows.length} source row(s) from ahanonline.`);

const badUnit = rows.filter((r) => r['c_واحد'] !== 'عدد');
if (badUnit.length) {
  console.error(`[couplers] ABORT — ${badUnit.length} source row(s) are not «عدد».`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

const sub = await pool.query<{ id: string; category_id: string }>(
  `SELECT sc.id, sc.category_id
     FROM sub_categories sc
     JOIN categories c ON c.id = sc.category_id
    WHERE c.slug = 'rebar' AND sc.slug = 'coupler'`,
);
if (sub.rowCount !== 1) {
  console.error('[couplers] ABORT — rebar/coupler sub-category not found.');
  process.exit(1);
}
const { id: subId, category_id: categoryId } = sub.rows[0]!;

const existing = await pool.query<{ slug: string }>(
  `SELECT slug FROM skus WHERE sub_category_id = $1`,
  [subId],
);
const have = new Set(existing.rows.map((r) => r.slug));

type Planned = {
  id: string;
  slug: string;
  name: string;
  size: string;
  price: number;
  code: string;
};

const planned: Planned[] = [];
const skipped: string[] = [];

for (const r of rows) {
  const typeSlug = TYPE_SLUG[r.group];
  if (!typeSlug) {
    console.error(`[couplers] ABORT — unmapped نوع «${r.group}». Add it to TYPE_SLUG.`);
    process.exit(1);
  }
  // Source sizes are ASCII («20», «16-18»); the catalog stores Persian digits.
  const size = toPersianDigits(r['c_سایز']);
  const slug = `rebar-coupler-${typeSlug}-${r['c_سایز'].replace(/[^0-9-]/g, '')}`;
  if (have.has(slug)) {
    skipped.push(slug);
    continue;
  }
  planned.push({
    id: ulid(),
    slug,
    // Reads exactly as ahanonline names the row: «کوپلر میانی استاندارد ۲۰».
    name: `${r.group} ${size}`,
    size,
    price: r.price_toman,
    code: r.code,
  });
}

console.log(`[couplers] ${planned.length} to create, ${skipped.length} already present.\n`);
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
for (const p of planned) {
  console.log(
    `  ${pad(p.slug, 40)} ${pad(p.name, 34)} ${pad(p.size, 8)} ${String(p.price).padStart(9)} تومان/عدد  (ahanonline code ${p.code})`,
  );
}

const prices = planned.map((p) => p.price);
if (prices.length) {
  console.log(
    `\n[couplers] price band ${Math.min(...prices).toLocaleString()} – ${Math.max(...prices).toLocaleString()} تومان per عدد`,
  );
}

if (!APPLY) {
  console.log('\n[couplers] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const p of planned) {
    await client.query(
      `INSERT INTO skus (id, sub_category_id, category_id, slug, name, size, unit,
                         theoretical_weight_kg, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'piece', NULL, true, now(), now())`,
      [p.id, subId, categoryId, p.slug, p.name, p.size],
    );
    await client.query(
      `INSERT INTO current_prices (sku_id, price, unit, delivery_time, vat_included,
                                   movement_pct, movement_dir, updated_at, updated_by, is_stale)
       VALUES ($1, $2, 'piece', $3, false, NULL, 'flat', now(), NULL, false)`,
      [p.id, p.price, DELIVERY_TIME],
    );
    await client.query(
      `INSERT INTO price_points (id, sku_id, price, unit, at) VALUES ($1, $2, $3, 'piece', now())`,
      [ulid(), p.id, p.price],
    );
  }
  await client.query('COMMIT');
  console.log(`\n[couplers] APPLIED — ${planned.length} sku(s) + prices + history points.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
