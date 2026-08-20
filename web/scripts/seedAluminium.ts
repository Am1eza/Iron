/**
 * Fill the آلومینیوم lines from مرکزآهن, now that the owner has approved it as
 * a domestic aluminium price source.
 *
 * ## Why a single source is enough here, and only here
 *
 * The 2026-08-20 pass found these numbers, checked them, and deliberately did
 * NOT write them: every other price it wrote had two independent sources
 * agreeing, and مرکزآهن is the only site in the comparison set that publishes
 * aluminium at all — ahanonline's آلومینیوم root serves zero priced rows. Its
 * own report called that «a ready lead, not a dead end» and put it to the
 * owner as decision #4. The owner has now approved مرکزآهن specifically, for
 * this product line, so the two-source bar does not apply. It is untouched
 * everywhere else.
 *
 * ## Source
 *
 * `markazeahan.com/product-category/aluminum/`, re-fetched live 2026-08-20
 * (saved to `.claude/audits/catalog-owner-decisions-2026-08-20/`). Every table
 * loaded here is dated **۱۴۰۵/۰۵/۲۸**; the numbers match what the previous
 * pass recorded, so they are re-confirmed, not re-used.
 *
 * | line              | sub-category        |  n | تومان/کیلوگرم | برند |
 * |-------------------|---------------------|---:|--------------:|------|
 * | نبشی آلومینیوم    | `aluminum-angle`    |  7 |       630,000 | — |
 * | لوله آلومینیوم    | `aluminum-pipe`     | 13 |       640,000 | آلوم طرح پاسارگاد |
 * | میلگرد آلومینیوم  | `aluminum-rebar`    | 57 |       620,000 | — (گرید ۷۰۰۰) |
 * | ورق آلومینیوم     | `aluminum-sheet` *  | 24 | 665,000–704,000 | اراک / پارس |
 * | پروفیل آلومینیوم  | `aluminum-profile` *|  7 |       650,000 | — |
 *
 * `*` created by this script — `felezat-rangi` has no ورق or پروفیل
 * sub-category yet.
 *
 * ## Two corrections to the premise this work was handed with
 *
 * The brief said لوله and میلگرد آلومینیوم «still have no source at all
 * (مرکزآهن doesn't list them either)». Re-fetching shows otherwise, and both
 * sub-categories already exist and are empty:
 *
 *   · **لوله آلومینیوم** — 13 priced rows at 640,000, برند آلوم طرح
 *     پاسارگاد, dated ۱۴۰۵/۰۵/۲۸. The previous report missed them because the
 *     table is titled «آلوم طرح پاسارگاد» (the brand) rather than «لوله».
 *   · **میلگرد آلومینیوم** — گرید ۷۰۰۰ is priced at 620,000, dated
 *     ۱۴۰۵/۰۵/۲۸. The report's «تماس بگیرید» is true of grades 2024/6061/7075,
 *     whose tables are stale (۱۴۰۵/۰۲/۱۲) and unpriced; those three are NOT
 *     loaded.
 *
 * سپری آلومینیوم and سیم‌جوش آلومینیوم really are absent from مرکزآهن, and
 * stay empty. So do all 7 استنلس fitting lines. Those are a supplier gap, not
 * a sourcing-bar one, and nothing here lowers a bar to fill them.
 *
 * ناودانی آلومینیوم is also live and priced (8 rows at 630,000) but has no
 * sub-category in this catalog and was not in scope; it is reported, not
 * loaded.
 *
 * ## What is deliberately NOT written
 *
 * **No `theoretical_weight_kg`.** مرکزآهن's نبشی and ناودانی tables do carry a
 * «وزن هر شاخه» column, but it contradicts itself: نبشی ۱٫۵×۳۰×۲۰ is listed at
 * 1.2 kg against 1.5 kg for the SMALLER ۱٫۵×۲۰×۲۰, and ناودانی ۱۰×۱۳ at 8 kg
 * against 0.6–1.5 kg for every one of its siblings. A column with visible
 * internal contradictions is not a published table, and a wrong weight on a
 * per-kilogram row is a wrong پیش‌فاکتور. Left null — the same refusal
 * `catalogCompose` already documents for ناودانی سبک/سنگین.
 *
 * **`branch_length_m = 6` where the table states it** (نبشی، لوله، پروفیل all
 * publish «طول(m): 6»). That is a stated fact, unlike the weights, and it is
 * what a future weight would be computed over.
 *
 * ## Modelling
 *
 *   · `unit = 'kg'`, `price_basis = 'kg'` — مرکزآهن's ناودانی table states
 *     «واحد: کیلوگرم» explicitly and every other aluminium table on the page
 *     prices the same way (a per-kg figure beside a per-شاخه weight).
 *   · `size` carries the source's own spec, in Persian digits: «۱٫۵×۲۰×۲۰»
 *     for نبشی, «۱۰۰×۴۰» for پروفیل, the OD in mm for لوله, the diameter for
 *     میلگرد, the thickness for ورق (matching how ورق already uses `size`).
 *   · `dimensions` on ورق only — «۲۰۰۰×۱۰۰۰», from the source's «ابعاد ۱*۲» m.
 *   · `grade` is the alloy where the source names one (میلگرد → «۷۰۰۰»).
 *   · «آجدار» ورق rows keep آجدار in the name and slug rather than getting a
 *     third sub-category — the same variant-in-the-name rule کوپلر and
 *     ساندویچ‌پانل follow.
 *   · Rows priced «تماس بگیرید» are skipped, not written as zero (4 ورق rows).
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · asserts every price inside 400,000–1,200,000 T/kg before writing
 *     anything (aluminium is ~8× steel; this band brackets it without
 *     admitting a steel price or a typo'd extra digit)
 *   · creates the two missing sub-categories only if absent
 *   · skips any slug already present — idempotent
 *
 *     ./node_modules/.bin/tsx scripts/seedAluminium.ts
 *     # …review, then re-run with --apply
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { ulid } from 'ulid';
import { toPersianDigits } from '../src/lib/utils/format';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[alu] DATABASE_URL is not set.');
  process.exit(1);
}

const SOURCE =
  '/opt/ahantime/.claude/audits/catalog-owner-decisions-2026-08-20/markazeahan_aluminium.json';
const DELIVERY_TIME = '۲۴ ساعت';
const BAND: readonly [number, number] = [400_000, 1_200_000];
/** Only tables dated this day are loaded; anything older is stale and skipped. */
const SOURCE_DATE = '۱۴۰۵/۰۵/۲۸';

/** Sub-categories this script may need to create, in `felezat-rangi`. */
const NEW_SUBS: Record<string, { name: string; order: number }> = {
  'aluminum-sheet': { name: 'ورق آلومینیوم', order: 11 },
  'aluminum-profile': { name: 'پروفیل آلومینیوم', order: 12 },
};

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
  sub: string;
  slug: string;
  name: string;
  size: string;
  dimensions: string | null;
  grade: string | null;
  factory: string | null;
  branchLengthM: number | null;
  price: number;
};

/** «1.5» → «۱٫۵»; the catalog stores Persian digits and the Persian decimal. */
const fa = (s: string | number) => toPersianDigits(String(s)).replace('.', '٫');
/** ASCII-safe slug fragment: «1.5*20*20» → «1.5x20x20». */
const asciiSpec = (s: string) => s.replace(/\s+/g, '').replace(/[*×]/g, 'x');

const raw: SourceRow[] = JSON.parse(await readFile(SOURCE, 'utf8'));

const stale = raw.filter((r) => r.updated !== SOURCE_DATE);
if (stale.length) {
  console.log(`[alu] ${stale.length} row(s) from a table not dated ${SOURCE_DATE} — skipped.`);
}
const rows = raw.filter((r) => r.updated === SOURCE_DATE && r.price_toman != null);
console.log(`[alu] ${rows.length} priced, today-dated source row(s).`);

const planned: Planned[] = [];
const problems: string[] = [];

for (const r of rows) {
  const price = r.price_toman!;
  const c = r.cells;
  const common = { id: ulid(), price, dimensions: null as string | null, grade: null as string | null };

  if (r.key === 'aluminum-angle') {
    // «نبشی 1.5*20*20 آلومینیوم» — thickness × leg × leg.
    const spec = r.name.match(/نبشی\s+([\d.*]+)\s+آلومینیوم/)?.[1];
    if (!spec) {
      problems.push(`unparsed نبشی name: ${r.name}`);
      continue;
    }
    planned.push({
      ...common,
      sub: 'aluminum-angle',
      slug: `felezat-rangi-aluminum-angle-${asciiSpec(spec)}`,
      name: `نبشی آلومینیوم ${fa(spec.replace(/\*/g, '×'))}`,
      size: fa(spec.replace(/\*/g, '×')),
      factory: null,
      branchLengthM: Number(c['pa_length']) || null,
    });
  } else if (r.key === 'aluminum-pipe') {
    const od = c['pa_diameter'];
    const t = c['pa_thickness-mm'];
    if (!od || !t) {
      problems.push(`لوله row missing قطر/ضخامت: ${r.name}`);
      continue;
    }
    planned.push({
      ...common,
      sub: 'aluminum-pipe',
      slug: `felezat-rangi-aluminum-pipe-${asciiSpec(od)}-${asciiSpec(t)}`,
      name: `لوله آلومینیوم ${fa(od)} میلی‌متر ضخامت ${fa(t)} میلی‌متر`,
      size: fa(od),
      factory: 'آلوم طرح پاسارگاد',
      branchLengthM: Number(c['pa_length']) || null,
    });
  } else if (r.key === 'aluminum-rebar') {
    const d = c['pa_diameter'];
    if (!d) {
      problems.push(`میلگرد row missing قطر: ${r.name}`);
      continue;
    }
    planned.push({
      ...common,
      sub: 'aluminum-rebar',
      slug: `felezat-rangi-aluminum-rebar-7000-${asciiSpec(d)}`,
      name: `میلگرد آلومینیوم گرید ۷۰۰۰ قطر ${fa(d)} میلی‌متر`,
      size: fa(d),
      grade: '۷۰۰۰',
      factory: null,
      // No طول column on the میلگرد tables — nothing to record.
      branchLengthM: null,
    });
  } else if (r.key === 'aluminum-sheet') {
    const t = c['pa_thickness-mm'];
    const brand = r.table.includes('اراک') ? 'اراک' : 'پارس';
    const checkered = r.table.includes('آجدار');
    if (!t) {
      problems.push(`ورق row missing ضخامت: ${r.name}`);
      continue;
    }
    planned.push({
      ...common,
      sub: 'aluminum-sheet',
      slug: `felezat-rangi-aluminum-sheet-${checkered ? 'checkered-' : ''}${asciiSpec(t)}-${
        brand === 'اراک' ? 'arak' : 'pars'
      }`,
      name: `ورق آلومینیوم ${checkered ? 'آجدار ' : ''}${fa(t)} ${brand}`,
      size: fa(t),
      // The source's «ابعاد ۱*۲» is in METRES; the catalog's `dimensions` is
      // written in millimetres everywhere else («۲۰۰۰×۱۰۰۰»).
      dimensions: '۲۰۰۰×۱۰۰۰',
      factory: brand,
      branchLengthM: null,
    });
  } else if (r.key === 'aluminum-profile') {
    const dims = c['pa_dimensions-mm'];
    const t = c['pa_thickness-mm'];
    if (!dims || !t) {
      problems.push(`پروفیل row missing ابعاد/ضخامت: ${r.name}`);
      continue;
    }
    planned.push({
      ...common,
      sub: 'aluminum-profile',
      // Thickness is part of the identity here: 100*40 ships in 1, 1.8 and 2 mm
      // at the same price, and they are three different products.
      slug: `felezat-rangi-aluminum-profile-${asciiSpec(dims)}-${asciiSpec(t)}`,
      name: `پروفیل آلومینیوم ${fa(dims.replace(/\*/g, '×'))} ضخامت ${fa(t)} میلی‌متر`,
      size: fa(dims.replace(/\*/g, '×')),
      factory: null,
      branchLengthM: Number(c['pa_length']) || null,
    });
  }
  // 'aluminum-channel' (ناودانی) is intentionally not handled — see the header.
}

if (problems.length) {
  console.error(`[alu] ABORT — ${problems.length} unparsed source row(s):`);
  for (const p of problems) console.error(`   ${p}`);
  process.exit(1);
}

const outOfBand = planned.filter((p) => p.price < BAND[0] || p.price > BAND[1]);
if (outOfBand.length) {
  console.error(`[alu] ABORT — ${outOfBand.length} price(s) outside ${BAND[0]}–${BAND[1]} T/kg.`);
  for (const p of outOfBand) console.error(`   ${p.slug}: ${p.price}`);
  process.exit(1);
}

const dupes = planned.filter((p, i) => planned.findIndex((q) => q.slug === p.slug) !== i);
if (dupes.length) {
  console.error(`[alu] ABORT — ${dupes.length} duplicate slug(s): ${dupes.map((d) => d.slug).join(', ')}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

const cat = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE slug = 'felezat-rangi'`);
if (cat.rowCount !== 1) {
  console.error('[alu] ABORT — felezat-rangi category not found.');
  process.exit(1);
}
const categoryId = cat.rows[0]!.id;

const subRows = await pool.query<{ id: string; slug: string }>(
  `SELECT id, slug FROM sub_categories WHERE category_id = $1`,
  [categoryId],
);
const subIdBySlug = new Map(subRows.rows.map((r) => [r.slug, r.id]));
const subsToCreate = Object.keys(NEW_SUBS).filter((s) => !subIdBySlug.has(s));

const missingSub = [...new Set(planned.map((p) => p.sub))].filter(
  (s) => !subIdBySlug.has(s) && !(s in NEW_SUBS),
);
if (missingSub.length) {
  console.error(`[alu] ABORT — sub-category not found and not creatable: ${missingSub.join(', ')}`);
  process.exit(1);
}

const existing = await pool.query<{ slug: string }>(`SELECT slug FROM skus WHERE slug = ANY($1)`, [
  planned.map((p) => p.slug),
]);
const have = new Set(existing.rows.map((r) => r.slug));
const toCreate = planned.filter((p) => !have.has(p.slug));

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
console.log(
  `[alu] ${toCreate.length} SKU(s) to create, ${planned.length - toCreate.length} already present; ` +
    `${subsToCreate.length} sub-category/ies to create.\n`,
);
for (const s of subsToCreate) console.log(`  + sub-category felezat-rangi/${s} — ${NEW_SUBS[s]!.name}`);
for (const p of toCreate) {
  console.log(
    `  ${pad(p.sub, 18)} ${pad(p.slug, 46)} ${pad(p.name, 44)} ${String(p.price).padStart(8)} تومان/کیلوگرم` +
      `${p.branchLengthM ? `  (${p.branchLengthM} m)` : ''}`,
  );
}

if (!toCreate.length && !subsToCreate.length) {
  console.log('[alu] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[alu] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const s of subsToCreate) {
    const id = ulid();
    await client.query(
      `INSERT INTO sub_categories (id, category_id, slug, name, "order", is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, categoryId, s, NEW_SUBS[s]!.name, NEW_SUBS[s]!.order],
    );
    subIdBySlug.set(s, id);
  }
  for (const p of toCreate) {
    const subId = subIdBySlug.get(p.sub)!;
    await client.query(
      `INSERT INTO skus (id, sub_category_id, category_id, slug, name, size, dimensions, grade,
                         factory, unit, price_basis, branch_length_m, theoretical_weight_kg,
                         is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'kg', 'kg', $10, NULL, true, now(), now())`,
      [p.id, subId, categoryId, p.slug, p.name, p.size, p.dimensions, p.grade, p.factory, p.branchLengthM],
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
  console.log(`\n[alu] APPLIED — ${subsToCreate.length} sub-category/ies + ${toCreate.length} sku(s).`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
