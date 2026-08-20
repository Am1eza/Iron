/**
 * Fill `sheet/sandwich-panel` — the last sub-category the 2026-08-20 pass left
 * empty for a reason it could not fix itself: its six real, today-dated rows
 * are all priced per «متر مربع» and `PRICE_UNITS` had no square-metre member.
 * It now does, so they load.
 *
 * ## The source
 *
 * ahanonline `/product-category/انواع-ورق/ساندویچ-پانل/`, fetched live for
 * THIS pass on 2026-08-20 and identical row for row to the scrape the previous
 * pass left ready (which is what the brief asked be re-checked). Every row is
 * dated 1405/5/29 (today) and carries an explicit «واحد: متر مربع» column —
 * this is not an inference, the page says it. Prices are read from the
 * `data-price` attribute in the served HTML, in ریال, and divided by 10.
 *
 *   | نوع    | ضخامت عایق | تومان / متر مربع |
 *   |--------|-----------:|-----------------:|
 *   | سقفی   |       ۴ cm |        3,832,000 |
 *   | سقفی   |       ۵ cm |        4,131,000 |
 *   | سقفی   |       ۶ cm |        4,461,000 |
 *   | دیواری |       ۴ cm |        3,709,090 |
 *   | دیواری |       ۶ cm |        4,245,454 |
 *   | دیواری |      ۱۰ cm |        5,665,454 |
 *
 * Monotonic in thickness within each type and سقفی > دیواری at equal
 * thickness, which is the right way round (a roof panel carries load).
 *
 * ## Modelling decisions
 *
 *   · `unit = 'sqm'` AND `price_basis = 'sqm'` — both, because they are two
 *     different facts and here they happen to agree: the customer orders متر
 *     مربع and the price is per متر مربع.
 *   · `size` holds the insulation thickness in centimetres («۴»), matching how
 *     ورق already uses `size` for a thickness (see catalogLabels' «ضخامت»).
 *     The unit is cm here, not mm — ahanonline states «سانتی متر» and a 4 mm
 *     sandwich panel does not exist.
 *   · The نوع (سقفی / دیواری) goes in the NAME, exactly as ahanonline names
 *     the row, following the کوپلر precedent — not into `grade`, which in this
 *     catalog means A2/A3/ST37.
 *   · `theoretical_weight_kg` is NULL. A panel's mass depends on both sheet
 *     faces' gauge and the foam density, none of which the page publishes.
 *   · `factory` is NULL — the table publishes no برند.
 *   · No cross-source check, and none is needed: this is not a price
 *     *estimate*, it is the only published number for a product line nobody
 *     else in this comparison set lists. It is flagged as single-source in the
 *     report.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · aborts unless every source row's «واحد» really is متر مربع
 *   · skips any slug already present, so re-running writes nothing
 *
 *     ./node_modules/.bin/tsx scripts/seedSandwichPanel.ts
 *     # …review, then re-run with --apply
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ulid } from 'ulid';
import { toPersianDigits } from '../src/lib/utils/format';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[panel] DATABASE_URL is not set.');
  process.exit(1);
}

const SOURCE =
  '/opt/ahantime/.claude/audits/catalog-owner-decisions-2026-08-20/ahanonline_sandwich_panel.json';
const DELIVERY_TIME = '۲۴ ساعت';

/** ahanonline's group heading → the ASCII slug segment and the Persian noun. */
const TYPE: Record<string, { slug: string; label: string }> = {
  'ساندویچ پانل سقفی': { slug: 'roof', label: 'ساندویچ پانل سقفی' },
  'ساندویچ پانل دیواری': { slug: 'wall', label: 'ساندویچ پانل دیواری' },
};

type SourceRow = {
  key: string;
  group: string;
  code: string;
  price_toman: number;
  'c_ضخامت(عایق)': string;
  'c_واحد': string;
};

const raw: SourceRow[] = JSON.parse(await readFile(SOURCE, 'utf8'));
const rows = raw.filter((r) => r.key === 'sheet/sandwich-panel');
console.log(`[panel] ${rows.length} source row(s) from ahanonline.`);

// «متر مربع» and «مترمربع» both occur in the served HTML — the same word, one
// with a space. Normalised before comparing rather than accepting a substring,
// so a genuinely different unit still aborts.
const norm = (s: string) => s.replace(/\s+/g, '');
const badUnit = rows.filter((r) => norm(r['c_واحد']) !== norm('متر مربع'));
if (badUnit.length) {
  console.error(`[panel] ABORT — ${badUnit.length} source row(s) are not «متر مربع»:`);
  for (const b of badUnit) console.error(`   ${b.code}: «${b['c_واحد']}»`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

const sub = await pool.query<{ id: string; category_id: string }>(
  `SELECT sc.id, sc.category_id
     FROM sub_categories sc
     JOIN categories c ON c.id = sc.category_id
    WHERE c.slug = 'sheet' AND sc.slug = 'sandwich-panel'`,
);
if (sub.rowCount !== 1) {
  console.error('[panel] ABORT — sheet/sandwich-panel sub-category not found.');
  process.exit(1);
}
const { id: subId, category_id: categoryId } = sub.rows[0]!;

const existing = await pool.query<{ slug: string }>(`SELECT slug FROM skus WHERE sub_category_id = $1`, [subId]);
const have = new Set(existing.rows.map((r) => r.slug));

type Planned = { id: string; slug: string; name: string; size: string; price: number; code: string };
const planned: Planned[] = [];
const skipped: string[] = [];

for (const r of rows) {
  const type = TYPE[r.group];
  if (!type) {
    console.error(`[panel] ABORT — unmapped نوع «${r.group}». Add it to TYPE.`);
    process.exit(1);
  }
  // «ضخامت 4 سانتی متری» / «ضخامت 5 سانتی متر» → 4 / 5.
  const cm = r['c_ضخامت(عایق)'].match(/\d+(?:\.\d+)?/)?.[0];
  if (!cm) {
    console.error(`[panel] ABORT — no thickness in «${r['c_ضخامت(عایق)']}» (code ${r.code}).`);
    process.exit(1);
  }
  const slug = `sheet-sandwich-panel-${type.slug}-${cm}`;
  if (have.has(slug)) {
    skipped.push(slug);
    continue;
  }
  const size = toPersianDigits(cm);
  planned.push({
    id: ulid(),
    slug,
    name: `${type.label} ضخامت ${size} سانتی‌متر`,
    size,
    price: r.price_toman,
    code: r.code,
  });
}

console.log(`[panel] ${planned.length} to create, ${skipped.length} already present.\n`);
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
for (const p of planned) {
  console.log(
    `  ${pad(p.slug, 36)} ${pad(p.name, 42)} ${pad(p.size, 4)} ${String(p.price).padStart(10)} تومان/متر مربع  (ahanonline code ${p.code})`,
  );
}

if (!planned.length) {
  console.log('[panel] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[panel] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const p of planned) {
    await client.query(
      `INSERT INTO skus (id, sub_category_id, category_id, slug, name, size, unit, price_basis,
                         theoretical_weight_kg, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'sqm', 'sqm', NULL, true, now(), now())`,
      [p.id, subId, categoryId, p.slug, p.name, p.size],
    );
    await client.query(
      `INSERT INTO current_prices (sku_id, price, unit, price_basis, delivery_time, vat_included,
                                   movement_pct, movement_dir, updated_at, updated_by, is_stale)
       VALUES ($1, $2, 'sqm', 'sqm', $3, false, NULL, 'flat', now(), NULL, false)`,
      [p.id, p.price, DELIVERY_TIME],
    );
    await client.query(
      `INSERT INTO price_points (id, sku_id, price, unit, price_basis, at)
       VALUES ($1, $2, $3, 'sqm', 'sqm', now())`,
      [ulid(), p.id, p.price],
    );
  }
  await client.query('COMMIT');
  console.log(`\n[panel] APPLIED — ${planned.length} sku(s) + prices + history points.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
