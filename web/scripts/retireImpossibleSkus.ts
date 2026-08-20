/**
 * One-off catalog correction: deactivate SKUs whose SPEC does not exist as a
 * product, and price the ones a defensible domestic source was found for.
 *
 * ## Where these came from
 *
 * `lib/mock/catalogData.ts` generates its sample catalog by slicing ONE size
 * list per category across that category's sub-categories at random
 * (`allSizes.slice(start, start + count)` on a seeded PRNG) and pairing each
 * with a random mill. `scripts/seed.ts` then writes the result into `skus`.
 * That is why «ورق رنگی ۲۰» exists: the ورق size list runs 0.5–40 mm and the
 * رنگی sub-category happened to draw the thick end. Colored/pre-painted coil
 * is a COATED THIN COIL — ahanonline's whole ورق رنگی listing is 0.48–0.6 mm.
 * A 20 mm one is not a product.
 *
 * These rows are `is_active = true` and render today. Their prices are all
 * from 2026-07-07 and therefore withheld (`PRICE_STALE_HIDE_AFTER_DAYS = 2`),
 * so a visitor sees a real product row that says «تماس بگیرید» — and the
 * phone call that follows is for something nobody can sell them.
 *
 * ## The bar for deactivating
 *
 * Soft-delete only (`is_active = false`), which is this repo's «delete»: the
 * row, its price history and any lead that references it all survive, and one
 * UPDATE reverses it.
 *
 * Every entry below was re-verified against a live source DURING this pass,
 * not taken from the earlier audit — and the rule is deliberately strict:
 * **deactivate only where the stored size exceeds even the widest producible
 * range any source states**, not merely the range currently listed for sale.
 * That check moved three groups the earlier audit had flagged:
 *
 *  - ورق آجدار — the audit said "checker plate is 3–10 mm" and flagged five
 *    SKUs. ahanonline's own آجدار filter lists 2, 2.5, 3, 4, 5, 6, 8, so ۲ and
 *    ۲.۵ are REAL and are left alone; only ۰.۷/۱/۱.۵ go.
 *  - مفتول گالوانیزه — the audit said "2.2–4 mm" and flagged four. مرکزآهن's
 *    production page says 0.5–6 mm, so ۵.۵ and ۶.۵ stay; only ۸ and ۱۰ go.
 *  - لوله مبلی — the audit said furniture pipe is dimensioned in mm, not
 *    inches. That is true of پروفیل مبلی (the box section); round لوله مبلی is
 *    genuinely sized in inches. All four are left alone.
 *
 * Anything that is merely unlisted-but-plausible is NOT deactivated — it is
 * left active and reported, because "ahanonline is not carrying it today" is
 * not the same claim as "it does not exist".
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · soft-delete only; no row is removed and no price history is touched
 *   · aborts if any listed slug is missing or already inactive, so the list
 *     cannot silently rot
 *
 *     ./node_modules/.bin/tsx scripts/retireImpossibleSkus.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';
import { ulid } from 'ulid';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[retire] DATABASE_URL is not set.');
  process.exit(1);
}

type Group = {
  line: string;
  /** What the market actually sells, and where that was read from today. */
  reality: string;
  source: string;
  slugs: string[];
};

const GROUPS: Group[] = [
  {
    line: 'ورق رنگی ۵ / ۶ / ۸ / ۱۰ / ۱۲ / ۱۵ / ۲۰ mm',
    reality:
      'pre-painted coil is 0.48–0.6 mm across the whole listing; the thinnest of ours is 8x the thickest real one',
    source: 'ahanonline /product-category/ورق/ورق-رنگی/ (fetched 2026-08-20)',
    slugs: [
      'sheet-colored-29',
      'sheet-colored-30',
      'sheet-colored-31',
      'sheet-colored-32',
      'sheet-colored-33',
      'sheet-colored-34',
      'sheet-colored-35',
    ],
  },
  {
    line: 'لوله اسپیرال ½ / ¾ / ۱ / ۱¼ / ۱½ / ۲ / ۲½ اینچ',
    reality:
      'spiral-welded pipe is made by helically winding a coil — the listing starts at 16" and nothing smaller is physically producible that way',
    source: 'ahanonline /product-category/لوله/لوله-اسپیرال/ (fetched 2026-08-20)',
    slugs: [
      'pipe-spiral-28',
      'pipe-spiral-29',
      'pipe-spiral-30',
      'pipe-spiral-31',
      'pipe-spiral-32',
      'pipe-spiral-33',
      'pipe-spiral-34',
    ],
  },
  {
    line: 'ورق اسیدشویی ۱۲ / ۱۵ / ۲۰ / ۲۵ / ۳۰ mm',
    reality: 'pickled sheet is 1.5–6 mm; ours are 2x to 5x the maximum',
    source: 'مرکزآهن + فولاد ایرانیان + آهن ملل, agreeing on 1.5–6 mm (searched 2026-08-20)',
    slugs: [
      'sheet-pickled-18',
      'sheet-pickled-19',
      'sheet-pickled-20',
      'sheet-pickled-21',
      'sheet-pickled-22',
    ],
  },
  {
    line: 'لوله داربستی ½ / ¾ / ۱ / ۱¼ / ۲ اینچ',
    reality:
      'scaffold tube is a single standardised size — every mill on the page (فولاد گستر حداد، صحرا فولاد سپاهان، بهفلز سپاهان، گل نرده، تهران شرق) lists 1½" and nothing else',
    source: 'ahanonline /product-category/لوله/لوله-داربستی/ (fetched 2026-08-20)',
    slugs: [
      'pipe-scaffold-16',
      'pipe-scaffold-17',
      'pipe-scaffold-18',
      'pipe-scaffold-19',
      'pipe-scaffold-21',
    ],
  },
  {
    line: 'ورق عرشه فولادی ۲ / ۲.۵ / ۳ / ۴ mm',
    reality:
      'deck sheet is a roll-formed galvanised coil, 0.7–1.25 mm. ۰.۷ and ۱.۵ are left ALONE — 0.7 is a listed thickness and 1.5 is only just over the cap',
    source: 'مرکزآهن + آکادمی عمران + آهن ملل, agreeing on 0.7–1.25 mm (searched 2026-08-20)',
    slugs: ['sheet-deck-45', 'sheet-deck-46', 'sheet-deck-47', 'sheet-deck-48'],
  },
  {
    line: 'پروفیل مبلی ۷۰×۷۰ / ۸۰×۸۰ / ۹۰×۹۰ / ۱۰۰×۱۰۰',
    reality:
      'furniture profile is a 0.7–1.5 mm decorative section; the listing tops out at 60×60 and 40×80',
    source: 'ahanonline /product-category/پروفیل-و-قوطی/پروفیل-مبلی/ (fetched 2026-08-20)',
    slugs: [
      'profile-furniture-32',
      'profile-furniture-33',
      'profile-furniture-34',
      'profile-furniture-35',
    ],
  },
  {
    line: 'ورق آجدار ۰.۷ / ۱ / ۱.۵ mm',
    reality:
      'checker plate is hot-rolled patterned plate, 2–8 mm. ۲ and ۲.۵ are REAL and are left alone',
    source: 'ahanonline /product-category/ورق/ورق-آجدار/ filter list (fetched 2026-08-20)',
    slugs: ['sheet-checkered-23', 'sheet-checkered-24', 'sheet-checkered-25'],
  },
  {
    line: 'سپری ۸ / ۱۰ / ۱۲',
    reality: 'سپری is rolled in 3, 4, 5 and 6 only. ۵ and ۶ are real and are left alone',
    source: 'ahanonline /product-category/نبشی-و-ناودانی/سپری/ size filter (fetched 2026-08-20)',
    slugs: ['angle-channel-tbar-30', 'angle-channel-tbar-31', 'angle-channel-tbar-32'],
  },
  {
    line: 'مفتول گالوانیزه ۸ / ۱۰ mm',
    reality: 'galvanised wire is drawn 0.5–6 mm. ۳ / ۴ / ۵.۵ / ۶.۵ are real and are left alone',
    source: 'مرکزآهن production page, 0.5–6 mm (searched 2026-08-20)',
    slugs: ['wire-wire-galvanized-17', 'wire-wire-galvanized-18'],
  },
  {
    line: 'ورق گالوانیزه ۸ / ۱۰ mm',
    reality:
      'galvanised sheet is listed 0.3–3 mm and the page states 0.18–6 mm producible. ۴ / ۵ / ۶ are within that and are left alone',
    source: 'ahanonline /product-category/ورق/ورق-گالوانیزه/ (fetched 2026-08-20)',
    slugs: ['sheet-galvanized-16', 'sheet-galvanized-17'],
  },
  {
    line: 'ورق روغنی ۴ mm',
    reality:
      'cold-rolled sheet is listed 0.4–2 mm and the page states 0.3–3 mm producible. ۲.۵ and ۳ are within that and are left alone',
    source: 'ahanonline /product-category/ورق/ورق-روغنی/ (fetched 2026-08-20)',
    slugs: ['sheet-oiled-10'],
  },
];

/**
 * Prices found for SKUs the 2026-08-19 pass had to leave unpriced.
 *
 * Two independent sources, agreeing, for every entry — a single site is not
 * enough to put a number on a live commercial page.
 */
type PriceWrite = {
  slug: string;
  price: number;
  why: string;
};

const PRICES: PriceWrite[] = [
  {
    slug: 'ibeam-hea-13', // «تیرآهن هاش سبک (HEA) ۲۰ ذوب‌آهن اصفهان»
    price: 200_000,
    why:
      'The 2026-08-19 pass left every هاش SKU unpriced because it judged ahanonline’s هاش page unreliable on brand. Re-checked today against two further sources and the domestic figure holds: ahanonline lists «HEA ۲۰ / برند ذوب آهن / واحد kg» at 200,000 (updated 1405/5/29), and مرکزآهن independently lists HEA ذوب آهن at 200,000 for sizes 14/18/20 — an exact match, with kilooton’s ذوب آهن HEB band (175,000–250,000) around it. The 2.2x premium over تیرآهن that looked implausible is real and has a cause: هاش is rolled domestically by essentially one mill in limited sizes, so it trades near import parity. This is the ONLY هاش SKU whose stored mill is a هاش producer — the other 11 are for Amir to decide (see the report).',
  },
  {
    slug: 'wire-wire-galvanized-13', // «مفتول گالوانیزه ۳ فولاد کویر کاشان»
    price: 109_090,
    why:
      'ahanonline’s سیم مفتول page publishes ONE price, 109,090, for every galvanised size 2.2–4 mm (updated 1405/5/29, 0% movement) — size is not a price axis and no mill is named, so a mill mismatch cannot move the number. Cross-checked against فولاد توفیقی at 103,118 (−5.5%). Our ۳ mm is an exact size match.',
  },
  {
    slug: 'wire-wire-galvanized-14', // «مفتول گالوانیزه ۴ یزد احرامیان»
    price: 109_090,
    why: 'Same source and reasoning as the ۳ mm row; ۴ mm is also an exact size match on that table.',
  },
];

const DELIVERY_TIME = '۲۴ ساعت';

const pool = new pg.Pool({ connectionString: url, max: 1 });

const allSlugs = GROUPS.flatMap((g) => g.slugs);
const dupes = allSlugs.filter((s, i) => allSlugs.indexOf(s) !== i);
if (dupes.length) {
  console.error(`[retire] ABORT — duplicate slug(s) in GROUPS: ${dupes.join(', ')}`);
  process.exit(1);
}

const { rows: found } = await pool.query<{
  slug: string;
  name: string;
  size: string | null;
  is_active: boolean;
}>(`SELECT slug, name, size, is_active FROM skus WHERE slug = ANY($1)`, [allSlugs]);
const bySlug = new Map(found.map((r) => [r.slug, r]));

const missing = allSlugs.filter((s) => !bySlug.has(s));
const alreadyOff = found.filter((r) => !r.is_active).map((r) => r.slug);
if (missing.length || alreadyOff.length) {
  if (missing.length) console.error(`[retire] ABORT — slug(s) not in the catalog: ${missing.join(', ')}`);
  if (alreadyOff.length) console.error(`[retire] ABORT — already inactive: ${alreadyOff.join(', ')}`);
  process.exit(1);
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

console.log(`[retire] ${allSlugs.length} sku(s) to deactivate, across ${GROUPS.length} product line(s).\n`);
for (const g of GROUPS) {
  console.log(`── ${g.line}  (${g.slugs.length})`);
  console.log(`   reality: ${g.reality}`);
  console.log(`   source:  ${g.source}`);
  for (const s of g.slugs) {
    const r = bySlug.get(s)!;
    console.log(`     ${pad(s, 28)} ${pad(r.name, 42)} ${r.size ?? ''}`);
  }
  console.log('');
}

const { rows: priceTargets } = await pool.query<{
  id: string;
  slug: string;
  name: string;
  unit: string;
  price: string | null;
}>(
  `SELECT s.id, s.slug, s.name, s.unit, cp.price::text AS price
     FROM skus s LEFT JOIN current_prices cp ON cp.sku_id = s.id
    WHERE s.slug = ANY($1)`,
  [PRICES.map((p) => p.slug)],
);
const priceBySlug = new Map(priceTargets.map((r) => [r.slug, r]));
const missingPrice = PRICES.filter((p) => !priceBySlug.has(p.slug));
if (missingPrice.length) {
  console.error(`[retire] ABORT — price target(s) not found: ${missingPrice.map((p) => p.slug).join(', ')}`);
  process.exit(1);
}
const wrongUnit = PRICES.filter((p) => priceBySlug.get(p.slug)!.unit !== 'kg');
if (wrongUnit.length) {
  console.error(`[retire] ABORT — price target(s) are not kg-denominated: ${wrongUnit.map((p) => p.slug).join(', ')}`);
  process.exit(1);
}

console.log(`[retire] ${PRICES.length} price(s) to write:\n`);
for (const p of PRICES) {
  const r = priceBySlug.get(p.slug)!;
  console.log(`── ${r.name}  (${p.slug})`);
  console.log(`   ${r.price ?? 'no row'} → ${p.price} تومان/kg`);
  console.log(`   ${p.why}\n`);
}

if (!APPLY) {
  console.log('[retire] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const res = await client.query(
    `UPDATE skus SET is_active = false, updated_at = now() WHERE slug = ANY($1) AND is_active`,
    [allSlugs],
  );
  for (const p of PRICES) {
    const r = priceBySlug.get(p.slug)!;
    // `movement_pct = NULL` / `movement_dir = 'flat'`: this is a first
    // publication after a 44-day gap, not a day-over-day move. Publishing a
    // percentage against the July baseline would be a fabricated نوسان.
    await client.query(
      `INSERT INTO current_prices (sku_id, price, unit, delivery_time, vat_included,
                                   movement_pct, movement_dir, updated_at, updated_by, is_stale)
       VALUES ($1, $2, 'kg', $3, false, NULL, 'flat', now(), NULL, false)
       ON CONFLICT (sku_id) DO UPDATE
         SET price = EXCLUDED.price, unit = EXCLUDED.unit, vat_included = EXCLUDED.vat_included,
             movement_pct = NULL, movement_dir = 'flat', updated_at = now(), is_stale = false`,
      [r.id, p.price, DELIVERY_TIME],
    );
    // A current_prices write with no matching price_points row breaks the
    // chart and the نوسان history behind it.
    await client.query(
      `INSERT INTO price_points (id, sku_id, price, unit, at) VALUES ($1, $2, $3, 'kg', now())`,
      [ulid(), r.id, p.price],
    );
  }
  await client.query('COMMIT');
  console.log(`[retire] APPLIED — ${res.rowCount} sku(s) deactivated, ${PRICES.length} price(s) written.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
