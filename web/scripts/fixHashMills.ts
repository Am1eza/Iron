/**
 * 11 of the 12 هاش SKUs name a mill that does not roll هاش — and once the
 * attribution is right, 10 of them can be priced.
 *
 * ## What was wrong
 *
 * The mock/seed generator paired every SKU with a RANDOM mill from its
 * category's list (`lib/mock/catalogData.ts`), so هاش inherited تیرآهن's mills.
 * فایکو، آریان فولاد، یزد احرامیان، جهان فولاد غرب and ماهان سپاهان all roll
 * IPE; none of them rolls a wide-flange section.
 *
 * ## Four sources, all fetched 2026-08-20, and they agree
 *
 *   · **ahanonline** `/تیرآهن-و-هاش/هاش/` (34 rows, dated 1405/5/29) —
 *     every برند on the page is one of «ذوب آهن» / «ذوب آهن اصفهان» /
 *     «وارداتی» / «ترک» / «ترک-کره». None of the five appears.
 *   · **مرکزآهن** `/product-category/هاش/` (38 rows, dated 1405/5/28) — only
 *     «ذوب آهن» and «وارداتی». None of the five appears.
 *   · **kilooton** `/catalog/heb` and `/catalog/hea` (1405/5/29) — producers
 *     «ذوب آهن» and «ترک» only, and the page states it outright: «در حال حاضر
 *     تولید عمده تیرآهن هاش سنگین در ایران توسط فولاد ذوب آهن اصفهان انجام
 *     می‌شود», with imports from Turkey, Korea and Spain.
 *   · **شهرآهن** `/hea-heb` — «کارخانه ذوب آهن اصفهان، لیدر تولید تیرآهن بال
 *     پهن در ایران است»; the five are absent.
 *
 * A fifth (فولاد جهان مهر) states ذوب آهن's own range: HEA ۱۴/۱۶/۱۸/۲۰ and
 * HEB ۱۶/۱۸/۲۰, plus medium-weight هاش ۱۴–۳۰. That is what settles the two
 * rows where ahanonline and مرکزآهن disagreed about a size's origin.
 *
 * ## Per SKU — the attribution and the price, with both figures
 *
 * | SKU        | stored mill    | → mill        | ahanonline | مرکزآهن  | written |
 * |------------|----------------|---------------|-----------:|--------:|--------:|
 * | HEA ۱۴     | فایکو          | ذوب‌آهن اصفهان |    200,000 | 200,000 | 200,000 |
 * | HEA ۱۶     | آریان فولاد    | ذوب‌آهن اصفهان |    195,454 |       — | 195,454 |
 * | HEA ۱۸     | فایکو          | ذوب‌آهن اصفهان |    200,000 | 200,000 | 200,000 |
 * | HEA ۲۲     | یزد احرامیان   | وارداتی       |    not listed | listed, unpriced | — |
 * | HEA ۲۴     | آریان فولاد    | وارداتی       |    200,000 | 200,000 | 200,000 |
 * | HEB ۱۶     | جهان فولاد غرب | ذوب‌آهن اصفهان |    200,000 | 200,000 | 200,000 |
 * | HEB ۱۸     | یزد احرامیان   | ذوب‌آهن اصفهان |    200,000 | 200,000 | 200,000 |
 * | HEB ۲۰     | جهان فولاد غرب | ذوب‌آهن اصفهان |    163,636 | 161,818 | 163,636 |
 * | HEB ۲۲     | جهان فولاد غرب | ذوب‌آهن اصفهان |    195,454 | 200,000 | 195,454 |
 * | HEB ۲۴     | یزد احرامیان   | ذوب‌آهن اصفهان |    209,090 | 209,090 | 209,090 |
 * | HEB ۲۷     | ماهان سپاهان   | **retired**   |    not listed | not listed | — |
 *
 * (HEA ۲۰ already carried ذوب‌آهن اصفهان and was priced at 200,000 by #202 —
 * it is the one row of the twelve that was already right, and this script
 * leaves it alone.)
 *
 * ### The two contested sizes
 *
 * **HEA ۱۶** — ahanonline names «ذوب آهن»; مرکزآهن files 16 under «وارداتی»
 * and publishes no price for it. فولاد جهان مهر's ذوب آهن range (HEA
 * ۱۴/۱۶/۱۸/۲۰) breaks the tie for ذوب آهن, and ahanonline's two size-16 rows —
 * one «ذوب آهن», one «وارداتی» — carry the SAME 195,454, so the price does not
 * depend on which way the tie goes.
 *
 * **HEB ۲۲/۲۴** — فولاد جهان مهر's HEB list stops at 200, but both price
 * sources name ذوب آهن explicitly for 22 and 24, and the same page's
 * medium-weight هاش range (۱۴–۳۰) covers them. Two published price tables beat
 * one prose range.
 *
 * ### HEB ۲۷ is retired, not re-attributed
 *
 * There is no HEB270. DIN 1025-2 runs …۲۶۰، ۲۸۰، ۳۰۰, and neither price table
 * lists a 27 in either series — ahanonline goes ۲۶ → ۳۰, مرکزآهن ۲۶ → ۲۸.
 * Soft-deleted (`is_active = false`) exactly as the 43 impossible SKUs were in
 * #202: the row, its price history and any lead referencing it survive, and
 * one UPDATE reverses it.
 *
 * ## Sanity band
 *
 * 150,000–260,000 T/kg. هاش trades ~2.2× above تیرآهن because essentially one
 * mill rolls it domestically in limited sizes, so it sits near import parity —
 * kilooton's own bands today are HEA 180,000–240,000 and HEB 175,000–250,000.
 * The one figure below that floor is HEB ۲۰ at 163,636, where ahanonline and
 * مرکزآهن agree to within 1.1% (163,636 vs 161,818) against kilooton's 175,000;
 * the two agreeing tables win and the third is recorded here.
 *
 * ## What this does NOT do
 *
 * No `theoretical_weight_kg` is written. مرکزآهن publishes a per-شاخه weight
 * for every هاش row (HEA۱۴ = ۲۹۷ kg over 12 m, HEB۲۰ = ۷۳۶ kg …) and those
 * match the standard sections, so the data exists — but filling them would
 * make every one of these rows auto-quotable, which is a commercial change
 * nobody asked for. Left null: `allPriced` stays false and the line routes to
 * a human. Recorded in the report as a ready follow-up.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · matches on SKU SLUG, and aborts if a slug is missing or its stored mill
 *     is not the one this script was written against (i.e. someone already
 *     changed it)
 *   · every written price is asserted inside the band before anything is
 *     touched
 *   · appends a `price_points` row so the chart keeps its history
 *   · idempotent — a second run reports 0 changes
 *
 *     ./node_modules/.bin/tsx scripts/fixHashMills.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';
import { ulid } from 'ulid';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[hash] DATABASE_URL is not set.');
  process.exit(1);
}

const BAND: readonly [number, number] = [150_000, 260_000];
const ZOB = 'ذوب‌آهن اصفهان';
const IMPORTED = 'وارداتی';

type Plan = {
  slug: string;
  /** The mill this script was written against — a guard, not a target. */
  wasFactory: string;
  /** null → retire the SKU instead of re-attributing it. */
  factory: string | null;
  /** null → leave the price alone (nothing published for this row). */
  price: number | null;
};

const PLAN: readonly Plan[] = [
  { slug: 'ibeam-hea-10', wasFactory: 'فایکو', factory: ZOB, price: 200_000 },
  { slug: 'ibeam-hea-11', wasFactory: 'آریان فولاد', factory: ZOB, price: 195_454 },
  { slug: 'ibeam-hea-12', wasFactory: 'فایکو', factory: ZOB, price: 200_000 },
  { slug: 'ibeam-hea-14', wasFactory: 'یزد احرامیان', factory: IMPORTED, price: null },
  { slug: 'ibeam-hea-15', wasFactory: 'آریان فولاد', factory: IMPORTED, price: 200_000 },
  { slug: 'ibeam-heb-16', wasFactory: 'جهان فولاد غرب', factory: ZOB, price: 200_000 },
  { slug: 'ibeam-heb-17', wasFactory: 'یزد احرامیان', factory: ZOB, price: 200_000 },
  { slug: 'ibeam-heb-18', wasFactory: 'جهان فولاد غرب', factory: ZOB, price: 163_636 },
  { slug: 'ibeam-heb-19', wasFactory: 'جهان فولاد غرب', factory: ZOB, price: 195_454 },
  { slug: 'ibeam-heb-20', wasFactory: 'یزد احرامیان', factory: ZOB, price: 209_090 },
  { slug: 'ibeam-heb-21', wasFactory: 'ماهان سپاهان', factory: null, price: null },
];

const outOfBand = PLAN.filter((p) => p.price != null && (p.price < BAND[0] || p.price > BAND[1]));
if (outOfBand.length) {
  console.error(`[hash] ABORT — ${outOfBand.length} planned price(s) outside ${BAND[0]}–${BAND[1]} T/kg.`);
  for (const p of outOfBand) console.error(`   ${p.slug}: ${p.price}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  slug: string;
  name: string;
  factory: string | null;
  is_active: boolean;
  price: string | null;
  price_basis: string | null;
};

const { rows } = await pool.query<Row>(
  `SELECT s.id, s.slug, s.name, s.factory, s.is_active,
          cp.price::text AS price, cp.price_basis
     FROM skus s
     LEFT JOIN current_prices cp ON cp.sku_id = s.id
    WHERE s.slug = ANY($1)`,
  [PLAN.map((p) => p.slug)],
);
const bySlug = new Map(rows.map((r) => [r.slug, r]));

const missing = PLAN.filter((p) => !bySlug.has(p.slug));
if (missing.length) {
  console.error(`[hash] ABORT — ${missing.length} slug(s) not found: ${missing.map((m) => m.slug).join(', ')}`);
  process.exit(1);
}

// Guard against acting on a row somebody else has already corrected: the whole
// premise of this script is the specific wrong mill it was researched against.
const drifted = PLAN.filter((p) => {
  const r = bySlug.get(p.slug)!;
  const done = r.factory === p.factory || (p.factory === null && !r.is_active);
  return !done && r.factory !== p.wasFactory;
});
if (drifted.length) {
  console.error('[hash] ABORT — stored mill is neither the researched one nor the target:');
  for (const p of drifted) console.error(`   ${p.slug}: «${bySlug.get(p.slug)!.factory}» (expected «${p.wasFactory}»)`);
  process.exit(1);
}

type Change = { plan: Plan; row: Row; retire: boolean; factory: string | null; price: number | null };
const changes: Change[] = [];
for (const p of PLAN) {
  const r = bySlug.get(p.slug)!;
  const retire = p.factory === null && r.is_active;
  const factory = p.factory !== null && r.factory !== p.factory ? p.factory : null;
  const price = p.price != null && Number(r.price) !== p.price ? p.price : null;
  if (retire || factory || price != null) changes.push({ plan: p, row: r, retire, factory, price });
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
console.log(`[hash] ${PLAN.length} targeted SKU(s); ${changes.length} to change.\n`);
for (const c of changes) {
  const what = c.retire
    ? 'RETIRE (is_active=false)'
    : `${c.factory ? `mill «${c.row.factory}» → «${c.factory}»` : ''}` +
      `${c.price != null ? `  price ${Number(c.row.price ?? 0).toLocaleString()} → ${c.price.toLocaleString()} T/kg` : ''}`;
  console.log(`  ${pad(c.row.slug, 16)} ${pad(c.row.name, 30)} ${what}`);
}

if (!changes.length) {
  console.log('[hash] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[hash] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const c of changes) {
    if (c.retire) {
      await client.query(`UPDATE skus SET is_active = false, updated_at = now() WHERE id = $1`, [c.row.id]);
      continue;
    }
    if (c.factory) {
      await client.query(`UPDATE skus SET factory = $2, updated_at = now() WHERE id = $1`, [c.row.id, c.factory]);
    }
    if (c.price != null) {
      // These rows are per-KILOGRAM: «واحد: کیلوگرم» on both price tables. The
      // basis column is written explicitly rather than left to its default so
      // this row says so rather than merely inheriting it.
      await client.query(
        `INSERT INTO current_prices (sku_id, price, unit, price_basis, delivery_time, vat_included,
                                     movement_pct, movement_dir, updated_at, updated_by, is_stale)
         VALUES ($1, $2, 'kg', 'kg', '۲۴ ساعت', false, NULL, 'flat', now(), NULL, false)
         ON CONFLICT (sku_id) DO UPDATE
            SET price = EXCLUDED.price, unit = 'kg', price_basis = 'kg',
                movement_pct = NULL, movement_dir = 'flat',
                updated_at = now(), is_stale = false`,
        [c.row.id, c.price],
      );
      await client.query(
        `INSERT INTO price_points (id, sku_id, price, unit, price_basis, at)
         VALUES ($1, $2, $3, 'kg', 'kg', now())`,
        [ulid(), c.row.id, c.price],
      );
    }
  }
  await client.query('COMMIT');
  console.log(`\n[hash] APPLIED — ${changes.length} SKU(s) updated.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
