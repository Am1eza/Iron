/**
 * Move every row whose price was never per-kilogram onto the new
 * `price_basis` column, and record the branch length where the source
 * publishes one.
 *
 * ## Why this exists
 *
 * `current_prices.price` was per KILOGRAM for every unit except `piece`, an
 * invariant carried in prose and repeated at five call sites. #201 fixed the
 * 19 تیرآهن rows that broke it by dividing them back to per-kilogram. 55 more
 * could not be fixed that way — there is no published weight for a copper coil
 * or a وال پست to divide by — so they stayed captioned «تومان / کیلوگرم» on a
 * price that is nothing of the sort. Migration 0042 adds the column; this
 * script is the one-time data move onto it.
 *
 * Everything NOT listed below keeps `price_basis = 'kg'`, which is the column
 * default and exactly what those ~880 rows always meant. Nothing is guessed.
 *
 * ## What moves, and the evidence for each
 *
 * | sub-category                 |  n | → basis  | length | source (re-fetched 2026-08-20) |
 * |------------------------------|---:|----------|-------:|--------------------------------|
 * | `rebar/coupler`              | 65 | `piece`  |      — | ahanonline publishes «واحد: عدد» on all 65 rows (#200) |
 * | `felezat-rangi/copper-pipe`  | 45 | `coil`   |   15 m | ahanonline's «حالت» column reads «۱۵ متری» on every row |
 * | `angle-channel/val-post`     |  8 | `branch` |      — | see the note below |
 * | `sheet/perforated-black`     |  2 | `sheet`  |      — | price scales with the sheet's own ابعاد (۲۰۰۰×۱۰۰۰ → ۳٬۲۲۶٬۸۱۸، ۲۵۰۰×۱۲۵۰ → ۴٬۹۶۶٬۸۱۸ — the same ~۱۰۲٬۰۰۰ T/kg either way) |
 *
 * **کوپلر is not cosmetic here.** Its 65 rows already priced correctly, via a
 * `unit === 'piece'` special case. With the denomination in a column that
 * special case is gone, so leaving them on the default `'kg'` basis would stop
 * every coupler line quoting. They move first.
 *
 * **لوله مسی cross-checks arithmetically.** ¼" × 0.63 mm over 15 m is ~1.52 kg
 * of copper and is listed at 3,634,385 تومان; ¾" × 0.63 mm is ~4.9 kg at
 * 11,763,932. Both imply ~2.39M T/kg — one constant rate across the range,
 * which is what a per-coil price looks like and what a per-kilogram price
 * could not.
 *
 * **وال پست gets `branch`, not `coil` or `piece`, and no length.** ahanonline
 * publishes no «واحد» column for it, and its prose paragraph — a generic
 * ناودانی explainer — says price tables are «به ازای هر کیلوگرم», which the
 * numbers flatly contradict (108,406–2,371,676 for a وال پست is not a
 * kilogram price of anything). Dividing the eight prices by ~73,000 T/kg
 * yields 1.5–32 kg, entirely ordinary masses for these pieces, so they are
 * per-item. «شاخه» is what the trade calls one and what `skus.unit` already
 * says. The `سایز` column («۱۰×۲۰» … «۲۰×۳۰۰») most likely encodes a ناودانی
 * size and a length in centimetres, but that is an inference, so no
 * `branch_length_m` is written — the caption reads «تومان / شاخه» and stops
 * there rather than inventing a length.
 *
 * ## Branch lengths, separately
 *
 * | sub-category         |  n | length | source |
 * |----------------------|---:|-------:|--------|
 * | `angle-channel/nabshi` |  4 |    6 m | ahanonline's own «حالت» column, per row — see below |
 * | `ibeam/tirahan`        | 25 |   12 m | «شاخه ۱۲ متری» on every ahanonline تیرآهن row; the stored weights already encode it (ذوب‌آهن ۱۴ = 155 kg = 12.9 × 12) |
 *
 * The four نبشی rows carrying a weight were matched to the ahanonline row
 * their stored price came from and every one is «۶ متری»:
 *
 *   · نبشی ۸ ظهوریان @76,590 → «ظهوریان 80×80 ض۸، ۶ متری، کارخانه» — exact.
 *   · نبشی ۱۰ ناب تبریز @77,280 → «ناب تبریز 100×100 ض۸، ۶ متری» (the other
 *     77,280 row on that page is a 70×70, i.e. not size ۱۰).
 *   · نبشی ۱۲ ناب تبریز @78,090 → the only 120×120 rows at that price are
 *     آونگان's, both «۶ متری» (the stored mill disagrees; out of scope here).
 *   · نبشی ۶ سپهر ایرانیان → سپهر ایرانیان publishes «۶ متری» on every row.
 *
 * This matters because the listing genuinely carries ۱۲ متری rows too (ناب
 * تبریز 70×70×5، 80×80×8، 100×100×8/10؛ اشتهارد؛ آونگان 100×100), which is
 * why the length had to become a per-SKU column rather than stay a per-line
 * constant. Writing 6 m explicitly changes no weight — it is the value
 * `CATALOG_WEIGHT_BASIS` already assumed — it just stops the assumption being
 * silent, so a row that is really ۱۲ متری can be corrected without a code
 * change.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · targets sub-category slugs, never ids, and reports the exact rows first
 *   · `current_prices` and `price_points` are moved with the SKU: a history
 *     point written before this ran was ALWAYS per-coil/per-عدد, so leaving it
 *     claiming `'kg'` would be a new falsehood, not a preserved one
 *   · idempotent — a second run reports 0 changes
 *
 *     ./node_modules/.bin/tsx scripts/setPriceBasis.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[basis] DATABASE_URL is not set.');
  process.exit(1);
}

/** sub-category slug → what its prices are actually denominated in. */
const BASIS_BY_SUB: Readonly<Record<string, string>> = {
  coupler: 'piece',
  'copper-pipe': 'coil',
  'val-post': 'branch',
  'perforated-black': 'sheet',
};

/** sub-category slug → branch/coil length in metres, where a source states one. */
const LENGTH_BY_SUB: Readonly<Record<string, number>> = {
  'copper-pipe': 15,
  nabshi: 6,
  tirahan: 12,
};

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  slug: string;
  name: string;
  sub: string;
  unit: string;
  price_basis: string;
  branch_length_m: number | null;
  weight: number | null;
};

const subs = [...new Set([...Object.keys(BASIS_BY_SUB), ...Object.keys(LENGTH_BY_SUB)])];

const { rows } = await pool.query<Row>(
  `SELECT s.id, s.slug, s.name, sc.slug AS sub, s.unit, s.price_basis, s.branch_length_m,
          s.theoretical_weight_kg AS weight
     FROM skus s
     JOIN sub_categories sc ON sc.id = s.sub_category_id
    WHERE s.is_active AND sc.slug = ANY($1)
    ORDER BY sc.slug, s.name`,
  [subs],
);

type Change = { row: Row; basis: string | null; lengthM: number | null };
const changes: Change[] = [];

for (const r of rows) {
  const wantBasis = BASIS_BY_SUB[r.sub];
  const wantLength = LENGTH_BY_SUB[r.sub];
  // نبشی only carries a length on the rows that carry a weight computed over
  // it; the sizes with no published section (۱۴/۱۶/۱۸) get no length either,
  // because nothing here establishes which branch they are sold in.
  const lengthApplies = r.sub !== 'nabshi' || r.weight != null;
  const basis = wantBasis && wantBasis !== r.price_basis ? wantBasis : null;
  const lengthM =
    wantLength != null && lengthApplies && r.branch_length_m !== wantLength ? wantLength : null;
  if (basis || lengthM != null) changes.push({ row: r, basis, lengthM });
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

console.log(`[basis] ${rows.length} active SKU(s) in the targeted sub-categories; ${changes.length} to change.\n`);
for (const c of changes) {
  console.log(
    `${pad(c.row.sub, 18)} ${pad(c.row.name, 42)} ` +
      `${c.basis ? `basis ${c.row.price_basis} → ${c.basis}` : pad('', 20)}` +
      `${c.lengthM != null ? `  length ${c.row.branch_length_m ?? '—'} → ${c.lengthM} m` : ''}`,
  );
}

if (!changes.length) {
  console.log('[basis] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[basis] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const c of changes) {
    if (c.basis) {
      await client.query(`UPDATE skus SET price_basis = $2, updated_at = now() WHERE id = $1`, [c.row.id, c.basis]);
      await client.query(`UPDATE current_prices SET price_basis = $2 WHERE sku_id = $1`, [c.row.id, c.basis]);
      await client.query(`UPDATE price_points SET price_basis = $2 WHERE sku_id = $1`, [c.row.id, c.basis]);
    }
    if (c.lengthM != null) {
      await client.query(`UPDATE skus SET branch_length_m = $2, updated_at = now() WHERE id = $1`, [
        c.row.id,
        c.lengthM,
      ]);
    }
  }
  await client.query('COMMIT');
  console.log(`\n[basis] APPLIED — ${changes.length} SKU(s) updated.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
