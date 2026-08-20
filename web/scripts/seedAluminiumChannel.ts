/**
 * Load ناودانی آلومینیوم from مرکزآهن — the one aluminium line the
 * 2026-08-20 owner-decisions pass found, priced, and deliberately left out.
 *
 * ## Why this is a follow-up and not part of that pass
 *
 * `seedAluminium.ts` loaded 108 SKUs across five aluminium lines under the
 * owner's approval of مرکزآهن as a domestic aluminium price source. ناودانی
 * آلومینیوم was live and priced on the same page and the same date, but
 * `felezat-rangi` had **no ناودانی sub-category at all**, and creating a
 * product line was outside that pass's brief. It was reported instead
 * (`CATALOG_OWNER_DECISIONS_REPORT.md` §4 and §7). The owner has now said
 * yes, so this script creates the sub-category and loads the rows.
 *
 * Nothing else changes. The two-source bar still stands everywhere except
 * aluminium-from-مرکزآهن, which is exactly what the owner approved.
 *
 * ## Source — re-fetched live, not reused
 *
 * `markazeahan.com/product-category/aluminum/`, fetched 2026-08-20 08:20 UTC
 * into `.claude/audits/aluminium-channel-2026-08-20/`. The «ناودانی
 * آلومینیوم» table is dated **۱۴۰۵/۰۵/۲۸** and carries 8 priced rows, all at
 * **630,000 تومان/کیلوگرم**, کارخانه **آلومین گستر**, طول **6 m**, واحد
 * **کیلوگرم**. That re-confirms what the previous pass recorded rather than
 * trusting it: the script filters on the date itself and asserts the unit,
 * so a stale or differently-denominated table cannot slip through.
 *
 * The 8 sizes: ۱۰×۱۰ · ۱۳×۱۰ · ۱۶×۱۶ · ۲۰×۱۶ · ۲۰×۲۰ · ۲۰×۳۰ · ۲۰×۴۰ · ۲۰×۵۰.
 *
 * ## Modelling
 *
 *   · `unit = 'kg'`, `price_basis = 'kg'` — the table's own «واحد» column
 *     reads «کیلوگرم» on every row, and the script aborts if it ever doesn't.
 *     `current_prices.price` is per kilogram always; a per-شاخه figure pasted
 *     into that column is what caused a 155× overcharge once.
 *   · `size` and the name come from the **product name** («ناودانی 20*40
 *     آلومینیوم» → «۲۰×۴۰»), which is how `seedAluminium.ts` already reads
 *     نبشی and how مرکزآهن titles the product a buyer searches for. The
 *     «سایز» column states the same pair in the opposite order on every one
 *     of the 8 rows («20*40» vs «40*20»), so it is used as an assertion —
 *     the script aborts if the two ever stop being reversals of each other
 *     — rather than as a second, conflicting spelling of the size.
 *   · `factory = 'آلومین گستر'` and `branch_length_m = 6`, both read per-row
 *     from the source rather than hardcoded.
 *   · `grade`/`dimensions` null — the table publishes neither.
 *
 * ## What is deliberately NOT written
 *
 * **No `theoretical_weight_kg`.** The «وزن هر شاخه» column contradicts
 * itself in this very table: ناودانی ۱۳×۱۰ is listed at **8 kg** against
 * 0.6–1.5 kg for every one of its seven siblings — still true on today's
 * re-fetch. A wrong weight on a per-kilogram row is a wrong پیش‌فاکتور, so
 * the column is not used at all, for any row. This is the same refusal
 * `seedAluminium.ts` and `catalogCompose` already document, and it matches
 * the standing rule that a weight is written only when the section table and
 * the branch length are *both* trustworthy. `branch_length_m = 6` is written
 * because the table states it plainly and it is what a future weight would
 * be computed over.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · loads only rows dated ۱۴۰۵/۰۵/۲۸ with a real price
 *   · aborts unless every row's «واحد» is کیلوگرم
 *   · asserts every price inside 400,000–1,200,000 T/kg (aluminium is ~8×
 *     steel; this band brackets it without admitting a steel price or a
 *     typo'd extra digit)
 *   · creates the sub-category only if absent; skips slugs already present —
 *     idempotent
 *   · one transaction
 *
 *     ./node_modules/.bin/tsx scripts/seedAluminiumChannel.ts
 *     # …review, then re-run with --apply
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ulid } from 'ulid';
import { toPersianDigits } from '../src/lib/utils/format';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[naodani-alu] DATABASE_URL is not set.');
  process.exit(1);
}

const SOURCE =
  process.env.ALU_CHANNEL_SOURCE ??
  '/opt/ahantime/.claude/audits/aluminium-channel-2026-08-20/markazeahan_aluminium_channel.json';
const DELIVERY_TIME = '۲۴ ساعت';
const BAND: readonly [number, number] = [400_000, 1_200_000];
/** Only rows from a table dated this day are loaded; anything older is stale. */
const SOURCE_DATE = '۱۴۰۵/۰۵/۲۸';
/** The sub-category this script creates — فلزات رنگی has no ناودانی line yet. */
const SUB = { slug: 'aluminum-channel', name: 'ناودانی آلومینیوم', order: 13 };

type SourceRow = {
  key: string;
  table: string;
  updated: string;
  name: string;
  price_toman: number | null;
  cells: Record<string, string>;
};

type Planned = {
  id: string;
  slug: string;
  name: string;
  size: string;
  factory: string;
  branchLengthM: number | null;
  price: number;
};

/** «1.5» → «۱٫۵»; the catalog stores Persian digits and the Persian decimal. */
const fa = (s: string | number) => toPersianDigits(String(s)).replace('.', '٫');
/** ASCII-safe slug fragment: «40*20» → «40x20». */
const asciiSpec = (s: string) => s.replace(/\s+/g, '').replace(/[*×]/g, 'x');

const raw: SourceRow[] = JSON.parse(await readFile(SOURCE, 'utf8'));

const stale = raw.filter((r) => r.updated !== SOURCE_DATE);
if (stale.length) {
  console.log(
    `[naodani-alu] ${stale.length} row(s) from a table not dated ${SOURCE_DATE} — skipped.`,
  );
}
const rows = raw.filter((r) => r.updated === SOURCE_DATE && r.price_toman != null);
console.log(`[naodani-alu] ${rows.length} priced, ${SOURCE_DATE}-dated source row(s).`);

const planned: Planned[] = [];
const problems: string[] = [];

for (const r of rows) {
  const c = r.cells;
  // «ناودانی 20*40 آلومینیوم» — the same shape seedAluminium.ts parses for نبشی.
  const spec = r.name.match(/ناودانی\s+([\d.*]+)\s+آلومینیوم/)?.[1];
  const sizeCell = c['pa_size'];
  const factory = c['pa_factory'];
  const unit = c['pa_unit'];

  if (!spec) {
    problems.push(`unparsed ناودانی name: ${r.name}`);
    continue;
  }
  // The «سایز» column is the name's pair reversed on all 8 rows. Treat that as
  // a contract: if it ever disagrees, the two columns mean different things and
  // a human has to decide which one names the product.
  if (sizeCell?.split('*').reverse().join('*') !== spec) {
    problems.push(
      `سایز «${sizeCell ?? '—'}» is not the reverse of the name's «${spec}»: ${r.name}`,
    );
    continue;
  }
  if (unit !== 'کیلوگرم') {
    // The whole price_basis='kg' modelling rests on this column.
    problems.push(`row is not priced per کیلوگرم (واحد=${unit ?? '—'}): ${r.name}`);
    continue;
  }
  if (!factory) {
    problems.push(`row missing کارخانه: ${r.name}`);
    continue;
  }

  const pretty = fa(spec.replace(/\*/g, '×'));
  planned.push({
    id: ulid(),
    slug: `felezat-rangi-aluminum-channel-${asciiSpec(spec)}`,
    name: `ناودانی آلومینیوم ${pretty}`,
    size: pretty,
    factory,
    branchLengthM: Number(c['pa_length']) || null,
    price: r.price_toman!,
  });
}

if (problems.length) {
  console.error(`[naodani-alu] ABORT — ${problems.length} unusable source row(s):`);
  for (const p of problems) console.error(`   ${p}`);
  process.exit(1);
}

if (!planned.length) {
  console.error('[naodani-alu] ABORT — the source yielded no rows at all.');
  process.exit(1);
}

const outOfBand = planned.filter((p) => p.price < BAND[0] || p.price > BAND[1]);
if (outOfBand.length) {
  console.error(
    `[naodani-alu] ABORT — ${outOfBand.length} price(s) outside ${BAND[0]}–${BAND[1]} T/kg.`,
  );
  for (const p of outOfBand) console.error(`   ${p.slug}: ${p.price}`);
  process.exit(1);
}

const dupes = planned.filter((p, i) => planned.findIndex((q) => q.slug === p.slug) !== i);
if (dupes.length) {
  console.error(
    `[naodani-alu] ABORT — ${dupes.length} duplicate slug(s): ${dupes.map((d) => d.slug).join(', ')}`,
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

const cat = await pool.query<{ id: string }>(
  `SELECT id FROM categories WHERE slug = 'felezat-rangi'`,
);
if (cat.rowCount !== 1) {
  console.error('[naodani-alu] ABORT — felezat-rangi category not found.');
  process.exit(1);
}
const categoryId = cat.rows[0]!.id;

const subRow = await pool.query<{ id: string }>(
  `SELECT id FROM sub_categories WHERE category_id = $1 AND slug = $2`,
  [categoryId, SUB.slug],
);
let subId = subRow.rows[0]?.id ?? null;
const createSub = subId === null;

const existing = await pool.query<{ slug: string }>(`SELECT slug FROM skus WHERE slug = ANY($1)`, [
  planned.map((p) => p.slug),
]);
const have = new Set(existing.rows.map((r) => r.slug));
const toCreate = planned.filter((p) => !have.has(p.slug));

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
console.log(
  `[naodani-alu] ${toCreate.length} SKU(s) to create, ${planned.length - toCreate.length} already ` +
    `present; sub-category felezat-rangi/${SUB.slug} ${subId ? 'exists' : 'to create'}.\n`,
);
if (!subId)
  console.log(`  + sub-category felezat-rangi/${SUB.slug} — ${SUB.name} (order ${SUB.order})`);
for (const p of toCreate) {
  console.log(
    `  ${pad(p.slug, 44)} ${pad(p.name, 30)} ${String(p.price).padStart(8)} تومان/کیلوگرم  ` +
      `${pad(p.factory, 14)}${p.branchLengthM ? `(${p.branchLengthM} m)` : ''}`,
  );
}

if (!toCreate.length && subId) {
  console.log('[naodani-alu] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[naodani-alu] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  if (!subId) {
    subId = ulid();
    await client.query(
      `INSERT INTO sub_categories (id, category_id, slug, name, "order", is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [subId, categoryId, SUB.slug, SUB.name, SUB.order],
    );
  }
  for (const p of toCreate) {
    await client.query(
      `INSERT INTO skus (id, sub_category_id, category_id, slug, name, size, dimensions, grade,
                         factory, unit, price_basis, branch_length_m, theoretical_weight_kg,
                         is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, 'kg', 'kg', $8, NULL, true, now(), now())`,
      [p.id, subId, categoryId, p.slug, p.name, p.size, p.factory, p.branchLengthM],
    );
    await client.query(
      `INSERT INTO current_prices (sku_id, price, unit, price_basis, delivery_time, vat_included,
                                   movement_pct, movement_dir, updated_at, updated_by, is_stale)
       VALUES ($1, $2, 'kg', 'kg', $3, false, NULL, 'flat', now(), NULL, false)`,
      [p.id, p.price, DELIVERY_TIME],
    );
    await client.query(
      `INSERT INTO price_points (id, sku_id, price, unit, price_basis, at)
       VALUES ($1, $2, $3, 'kg', 'kg', now())`,
      [ulid(), p.id, p.price],
    );
  }
  await client.query('COMMIT');
  console.log(
    `\n[naodani-alu] APPLIED — ${createSub ? '1 sub-category + ' : ''}${toCreate.length} sku(s).`,
  );
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
