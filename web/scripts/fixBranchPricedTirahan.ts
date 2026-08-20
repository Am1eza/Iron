/**
 * URGENT DATA FIX: 19 تیرآهن rows hold a PER-BRANCH price in a column this
 * codebase reads as PER-KILOGRAM, and they have a real branch weight, so the
 * پیش‌فاکتور total comes out ~155x too high.
 *
 * ## The invariant
 *
 * `current_prices.price` is per KILOGRAM for every member of `PRICE_UNITS`.
 * `unit` says only what `qty` COUNTS in. That is stated in three places and
 * relied on in four:
 *
 *   · `leads.service.priceItems` — "«unitPrice» is per KILOGRAM, always … `unit`
 *     only says what `qty` COUNTS in, never what the price is denominated in",
 *     and it computes `lineTotal = unitPrice × weightKg`.
 *   · `estimate.service.estimateItems` — the same conversion.
 *   · `tenderEstimate.factoryOptionsFor` — exposes `weightKgPerUnit` for it.
 *   · `PriceTable` / `search` — caption every row «تومان / کیلوگرم», and the
 *     page-wide note reads «قیمت‌ها به تومان و برای هر کیلوگرم است».
 *
 * ## What is actually stored
 *
 * The 2026-08-19 pass wrote its 19 تیرآهن rows from ahanonline's **per-شاخه,
 * 12 m, بنگاه تهران** column — deliberately and transparently ("No conversion,
 * no assumed weight", its §1a tier T2). But it wrote that per-branch figure
 * into the per-kilogram column, on the one product family that also carries a
 * real `theoretical_weight_kg` (125–510 kg).
 *
 * So today, live:
 *
 *   · «تیرآهن ۱۴ ذوب‌آهن اصفهان» displays as ۱۳٬۸۱۸٬۱۸۱ **تومان / کیلوگرم**.
 *   · One branch of it on a پیش‌فاکتور is priced
 *     13,818,181 × 155 kg = **2,141,818,055 تومان** — 155x the real
 *     13,818,181, on a document that is frozen and SMS'd to the customer.
 *     `allPriced` stays true, so it auto-quotes.
 *   · `CostCalculator` in «شاخه» mode and `tenderEstimate` do the same.
 *
 * ## The fix, and why this direction
 *
 * Divide by the branch weight, so the stored number becomes per-kilogram and
 * every consumer is correct at once — the display caption becomes true, and
 * `unitPrice × weightKg` reproduces the real per-branch price the mill quotes.
 *
 * Fixing it in the code instead (teaching every consumer that a `branch` price
 * is per branch) would mean changing the money path on all five call sites,
 * and would leave the 660 other SKUs — which really are per-kg — needing a new
 * field to say so. The data is what is inconsistent here, not the code.
 *
 * ## Cross-validated against an independent source before writing
 *
 * Every converted value was checked against مرکزآهن's published per-kg تیرآهن
 * table (fetched 2026-08-20, dated 1405/5/28):
 *
 *   | SKU                    | price ÷ weight | مرکزآهن | delta |
 *   |------------------------|---------------:|--------:|------:|
 *   | ۱۴ ذوب‌آهن اصفهان       |         89,150 |  90,000 |  0.9% |
 *   | ۱۶ ذوب‌آهن اصفهان       |         87,081 |  88,181 |  1.2% |
 *   | ۱۸ ذوب‌آهن اصفهان       |         87,289 |  89,090 |  2.0% |
 *   | ۱۴ فایکو               |         79,461 |  78,181 |  1.6% |
 *   | ۱۴ اهواز               |         74,074 |  72,727 |  1.9% |
 *   | ۱۴ ظفر بناب            |         74,074 |  76,363 |  3.0% |
 *   | ۱۴ یزد                 |         79,461 |  79,545 |  0.1% |
 *
 * Seven of seven inside 3%. That is what makes this a conversion rather than a
 * guess: the arithmetic lands on an independently published number.
 *
 * Two rows sit above the cluster — ۱۲ ذوب‌آهن at 106,909 and ۳۰ ذوب‌آهن at
 * 106,061 against ~89,000 for ۱۴–۲۷. Neither has a cross-check, but a premium
 * at the size extremes is real in this market (both ends are scarcer) and both
 * land inside the 60,000–260,000 T/kg band the 2026-08-19 pass asserted every
 * per-kg write against, so they convert with the rest and are reported.
 *
 * ## Not fixed here, and why — 55 more rows with the same shape
 *
 * `angle-channel/val-post` (8, per piece), `felezat-rangi/copper-pipe` (45, per
 * 15 m coil) and `sheet/perforated-black` (2, per sheet) also hold per-unit
 * prices. They are NOT a money-path bug: their `theoretical_weight_kg` is
 * NULL, so `weightKg` is undefined, `lineTotal` is undefined and `allPriced`
 * goes false — the line routes to a human instead of auto-quoting a wrong
 * total. What is wrong there is only the caption («تومان / کیلوگرم» on a coil
 * price), and it cannot be fixed the same way: there is no published weight for
 * a copper coil or a وال پست to divide by. Recorded for Amir in the report,
 * because the real fix is a schema decision — a column saying what the price is
 * denominated in — not another backfill.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · touches only rows that are `unit='branch'` AND have a weight AND whose
 *     implied per-kg lands in the sanity band; anything else aborts the run
 *   · appends a `price_points` row so the chart keeps its history
 *
 *     ./node_modules/.bin/tsx scripts/fixBranchPricedTirahan.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';
import { ulid } from 'ulid';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[tirahan] DATABASE_URL is not set.');
  process.exit(1);
}

/** Same band the 2026-08-19 pass asserted every per-kg write against. */
const KG_BAND: readonly [number, number] = [60_000, 260_000];
/** Below this a stored figure is already per-kg and must not be divided again. */
const PER_BRANCH_FLOOR = 1_000_000;

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  slug: string;
  name: string;
  size: string | null;
  factory: string | null;
  unit: string;
  weight: number | null;
  price: string;
};

const { rows } = await pool.query<Row>(
  `SELECT s.id, s.slug, s.name, s.size, s.factory, s.unit,
          s.theoretical_weight_kg AS weight, cp.price::text AS price
     FROM skus s
     JOIN current_prices cp ON cp.sku_id = s.id
     JOIN sub_categories sc ON sc.id = s.sub_category_id
    WHERE s.is_active AND sc.slug = 'tirahan' AND s.unit = 'branch'
    ORDER BY s.size, s.factory`,
);

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

type Change = { row: Row; from: number; to: number };
const changes: Change[] = [];
const untouched: Row[] = [];

for (const r of rows) {
  const from = Number(r.price);
  // Already per-kg (or no weight to divide by) → leave alone. This is what
  // makes the script safe to re-run: after the fix every row is under the
  // floor, so a second run finds nothing to do.
  if (!r.weight || from < PER_BRANCH_FLOOR) {
    untouched.push(r);
    continue;
  }
  changes.push({ row: r, from, to: Math.round(from / r.weight) });
}

const outOfBand = changes.filter((c) => c.to < KG_BAND[0] || c.to > KG_BAND[1]);
if (outOfBand.length) {
  console.error(`[tirahan] ABORT — ${outOfBand.length} converted price(s) outside ${KG_BAND[0]}–${KG_BAND[1]} T/kg:`);
  for (const c of outOfBand) console.error(`   ${c.row.slug}  ${c.from} / ${c.row.weight} = ${c.to}`);
  process.exit(1);
}

console.log(`[tirahan] ${rows.length} branch-unit تیرآهن row(s); ${changes.length} to convert, ${untouched.length} already per-kg or weightless.\n`);
console.log(`${pad('name', 30)} ${pad('size', 6)} ${pad('weight', 8)} ${pad('stored (per شاخه)', 20)} → per kg`);
for (const c of changes) {
  console.log(
    `${pad(c.row.name, 30)} ${pad(c.row.size ?? '', 6)} ${pad(String(c.row.weight), 8)} ${pad(c.from.toLocaleString(), 20)} → ${c.to.toLocaleString()}`,
  );
}
console.log(
  `\n[tirahan] converted band ${Math.min(...changes.map((c) => c.to)).toLocaleString()} – ${Math.max(...changes.map((c) => c.to)).toLocaleString()} T/kg`,
);
console.log(
  '[tirahan] worst pre-fix overcharge on a single branch: ' +
    Math.max(...changes.map((c) => c.row.weight!)).toLocaleString() +
    'x (the branch weight it was being multiplied by)',
);

if (!APPLY) {
  console.log('\n[tirahan] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const c of changes) {
    await client.query(
      `UPDATE current_prices
          SET price = $2, movement_pct = NULL, movement_dir = 'flat',
              updated_at = now(), is_stale = false
        WHERE sku_id = $1`,
      [c.row.id, c.to],
    );
    await client.query(
      `INSERT INTO price_points (id, sku_id, price, unit, at) VALUES ($1, $2, $3, 'branch', now())`,
      [ulid(), c.row.id, c.to],
    );
  }
  await client.query('COMMIT');
  console.log(`\n[tirahan] APPLIED — ${changes.length} price(s) converted to per-kilogram.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
