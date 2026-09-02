/**
 * Write `theoretical_weight_kg` and `branch_length_m` for the priced هاش
 * (HEA/HEB) SKUs.
 *
 * ## Why this was held back, and what changed
 *
 * `CATALOG_OWNER_DECISIONS_REPORT.md` §2 corrected the mill and the price on
 * eleven هاش rows but deliberately left every weight NULL: مرکزآهن publishes a
 * per-شاخه weight for each one, but filling them changes what the shop can
 * quote without a human, and that is a commercial decision, not a data fix.
 * The owner approved it on 2026-08-20. This script is that approval.
 *
 * ## What it writes, and where the numbers come from
 *
 * `WEIGHTS` below is مرکزآهن's own «وزن هر شاخه (kg)» column, re-fetched live
 * on 2026-08-20 (NOT copied from the report — the earlier figures were four
 * days old and had to be re-read). Every row was then cross-checked against
 * the DIN 1025-3 (HEA) / DIN 1025-2 (HEB) nominal section table now held in
 * `weight.ts`, over the 12 m branch مرکزآهن quotes every هاش row in.
 *
 * The cross-check is CODE, not a comment: `theoreticalWeightFor` is called for
 * every row and a divergence above `TOLERANCE` aborts the run before anything
 * is written. Two published tables agreeing is the whole basis for trusting
 * these numbers, so the script refuses to run if they stop agreeing.
 *
 *   HEA ۱۴  297   (DIN 24.7 kg/m × 12 = 296.4 — 0.2 %)
 *   HEA ۱۶  365   (DIN 30.4 × 12 = 364.8 — 0.05 %)
 *   HEA ۱۸  426   (DIN 35.5 × 12 = 426.0 — 0 %)
 *   HEA ۲۰  508   (DIN 42.3 × 12 = 507.6 — 0.08 %)
 *   HEB ۱۶  512   (DIN 42.6 × 12 = 511.2 — 0.16 %)
 *   HEB ۱۸  615   (DIN 51.2 × 12 = 614.4 — 0.1 %)
 *   HEB ۲۰  736   (DIN 61.3 × 12 = 735.6 — 0.05 %)
 *   HEB ۲۲  858   (DIN 71.5 × 12 = 858.0 — 0 %)
 *   HEB ۲۴  999   (DIN 83.2 × 12 = 998.4 — 0.06 %)
 *
 * ## The tenth row: HEA ۲۴ gets a length and NO weight
 *
 * The brief asked for ten. Nine are written. مرکزآهن publishes HEA ۲۴ = 702 kg
 * where DIN 1025-3 gives 60.3 kg/m × 12 m = 723.6 kg — a 3.0 % gap, twenty
 * times any other row's, confirmed against two independent section references
 * (Dlubal and structolution, both citing DIN 1025-3 / EN 10365). ahanonline
 * carries HEA ۲۴ but publishes no weight column at all, so there is no third
 * source to break the tie.
 *
 * 3 % of a 700 kg branch is 21 kg, and at 200,000 تومان/kg that is 4.2 million
 * تومان per شاخه on a document the customer keeps. The instruction for this
 * pass was explicit — do not write a number the two sources disagree on — so
 * HEA ۲۴ keeps a NULL weight and «نامشخص» in the price table, which is the
 * same honest state every other unresolvable row in this catalog is in.
 *
 * `branch_length_m = 12` IS written for it, and for all ten: the length is not
 * in dispute (مرکزآهن's «طول» column reads 12 for every هاش row and ahanonline
 * captions all of them «شاخه ۱۲ متری»), it is the same convention the 25
 * تیرآهن rows in this category already carry, and it drives the caption, not
 * the money.
 *
 * HEA ۲۲ is untouched: it has no live price (its stored 37,350 is stale and
 * hidden), so it is outside this pass's scope.
 *
 * ## What this actually changes about quoting — measured, not assumed
 *
 * The brief expected these ten rows to become `allPriced = true`-eligible.
 * They do not, and the reason is worth recording: هاش SKUs carry
 * `unit = 'kg'`, not `unit = 'branch'` like تیرآهن. A kg-counted line is
 * ALREADY auto-quoted today (`lineWeightKg('kg','kg',qty)` returns `qty` and
 * never reads the weight), and a branch-counted line still trips
 * `unitMismatch` in `leads.service.priceItems`, which withholds `unitPrice`
 * regardless of weight. What the weight really buys is:
 *
 *   · «وزن شاخه» renders on the price table and the product card instead of
 *     «نامشخص»;
 *   · a branch-counted line now carries its REAL mass («۵ شاخه = ۱٬۴۸۵ kg»)
 *     instead of no mass, so `totalWeightKg` on the پیش‌فاکتور stops
 *     under-counting — and it still routes to a human for the price.
 *
 * `leads.pricing.hash.test.ts` pins both halves of that, before and after.
 * Flipping هاش to `unit = 'branch'` WOULD make it branch-auto-quotable; that
 * is a separate commercial decision and is not done here.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one UPDATE per row, by primary key, touching only the two columns
 *   · aborts before any write if a row's مرکزآهن figure and the DIN table
 *     disagree by more than TOLERANCE, or if a targeted row is missing,
 *     inactive, or has no price row
 *   · idempotent: a second run reports zero changes
 *
 *     ./node_modules/.bin/tsx scripts/fillHashWeights.ts
 *     # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { theoreticalWeightFor } from '../src/lib/utils/catalogCompose';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[hash] DATABASE_URL is not set.');
  process.exit(1);
}

/** The branch length مرکزآهن and ahanonline both quote every هاش row in. */
const BRANCH_LENGTH_M = 12;

/**
 * Fractional divergence between مرکزآهن's published per-شاخه weight and the
 * DIN section table above which this script refuses to write. 0.5 % is
 * comfortably above the rounding the nine agreeing rows show (max 0.2 %) and
 * far below the one that does not (3.0 %).
 */
const TOLERANCE = 0.005;

/** مرکزآهن's «وزن هر شاخه (kg)» column, /product-category/هاش/, 2026-08-20.
 *  `null` = published but NOT corroborated by DIN — write no weight. */
const WEIGHTS: Readonly<Record<string, number | null>> = {
  'ibeam-hea-10': 297, // HEA ۱۴
  'ibeam-hea-11': 365, // HEA ۱۶
  'ibeam-hea-12': 426, // HEA ۱۸
  'ibeam-hea-13': 508, // HEA ۲۰
  'ibeam-hea-15': null, // HEA ۲۴ — مرکزآهن 702 vs DIN 723.6, see the header
  'ibeam-heb-16': 512, // HEB ۱۶
  'ibeam-heb-17': 615, // HEB ۱۸
  'ibeam-heb-18': 736, // HEB ۲۰
  'ibeam-heb-19': 858, // HEB ۲۲
  'ibeam-heb-20': 999, // HEB ۲۴
};

/** The figure مرکزآهن publishes for the row we are NOT writing, so the
 *  divergence that held it back is asserted rather than described. */
const HELD = { id: 'ibeam-hea-15', published: 702 };

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  name: string;
  size: string | null;
  unit: string;
  basis: string;
  weight: string | null;
  length: string | null;
  cat: string;
  sub: string;
  active: boolean;
  price: string | null;
};

const ids = Object.keys(WEIGHTS);
const { rows } = await pool.query<Row>(
  `SELECT s.id, s.name, s.size, s.unit, s.price_basis AS basis,
          s.theoretical_weight_kg::text AS weight,
          s.branch_length_m::text AS length,
          c.slug AS cat, sc.slug AS sub,
          p.price::text AS price
     FROM skus s
     JOIN categories c ON c.id = s.category_id
     JOIN sub_categories sc ON sc.id = s.sub_category_id
     LEFT JOIN current_prices p ON p.sku_id = s.id
    WHERE s.id = ANY($1::text[])
    ORDER BY sc.slug, s.id`,
  [ids],
);

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
// Annotated on the BINDING, not just on the arrow: TypeScript only narrows
// control flow past a never-returning call when the identifier itself carries
// the type, and without that every `published`/`din` below reads as possibly
// null despite the guard that just exited.
const fail: (msg: string) => never = (msg) => {
  console.error(`[hash] ABORT — ${msg}`);
  process.exit(1);
};

if (rows.length !== ids.length) {
  const found = new Set(rows.map((r) => r.id));
  fail(
    `expected ${ids.length} sku(s), found ${rows.length}: missing ${ids.filter((i) => !found.has(i)).join(', ')}`,
  );
}

console.log(`[hash] ${rows.length} هاش sku(s) targeted. Cross-checking مرکزآهن against DIN 1025-2/-3…\n`);
console.log(
  `  ${pad('sku', 14)} ${pad('name', 30)} ${pad('unit/basis', 12)} ${'markaze'.padStart(8)} ${'DIN x12m'.padStart(9)} ${'delta'.padStart(7)}  verdict`,
);

type Plan = { row: Row; weight: number | null; length: number };
const plans: Plan[] = [];

for (const row of rows) {
  if (!row.active) fail(`${row.id} is inactive — this pass writes only live, priced rows.`);
  if (row.price === null) fail(`${row.id} has no price row — out of scope for this pass.`);
  const published = WEIGHTS[row.id] ?? (row.id === HELD.id ? HELD.published : null);
  // The same function the admin form and the وزن‌سنج use, so the number that
  // goes into the database cannot disagree with the one the app derives.
  const din = theoreticalWeightFor(row.cat, row.size ?? undefined, row.sub, BRANCH_LENGTH_M);
  if (din === null)
    fail(
      `${row.id} (${row.cat}/${row.sub} «${row.size}») has no DIN section — the table in weight.ts does not cover it.`,
    );
  if (published === null) fail(`${row.id} has no published مرکزآهن weight to check against.`);
  const delta = Math.abs(published - din) / din;
  const agree = delta <= TOLERANCE;
  // `?? null` because an id absent from WEIGHTS is impossible here (the query
  // is keyed on its own keys) but the index signature cannot know that.
  const write = WEIGHTS[row.id] ?? null;

  // The row we chose NOT to write must be the row that fails the check — if
  // it ever starts agreeing, this script should be edited, not silently keep
  // withholding a number that is now corroborated.
  if (write === null && agree) {
    fail(
      `${row.id} is marked "held" but مرکزآهن ${published} now agrees with DIN ${din} (delta ${(delta * 100).toFixed(2)}%). Re-review before running.`,
    );
  }
  if (write !== null && !agree) {
    fail(
      `${row.id}: مرکزآهن ${published} vs DIN ${din} differ by ${(delta * 100).toFixed(2)}% (> ${(TOLERANCE * 100).toFixed(1)}%). Nothing written.`,
    );
  }

  console.log(
    `  ${pad(row.id, 14)} ${pad(row.name, 30)} ${pad(`${row.unit}/${row.basis}`, 12)} ${String(published).padStart(8)} ${din.toFixed(1).padStart(9)} ${`${(delta * 100).toFixed(2)}%`.padStart(7)}  ${write === null ? 'HELD — weight stays NULL' : 'agree -> write'}`,
  );
  plans.push({ row, weight: write, length: BRANCH_LENGTH_M });
}

console.log('\n--- planned writes ---');
let changes = 0;
for (const p of plans) {
  const fromW = p.row.weight === null ? 'NULL' : Number(p.row.weight).toFixed(1);
  const toW = p.weight === null ? 'NULL' : p.weight.toFixed(1);
  const fromL = p.row.length === null ? 'NULL' : Number(p.row.length).toFixed(0);
  const toL = String(p.length);
  const noop = fromW === toW && fromL === toL;
  if (!noop) changes += 1;
  console.log(
    `  ${pad(p.row.id, 14)} ${pad(p.row.name, 30)} weight ${pad(fromW, 6)} -> ${pad(toW, 6)}   length ${pad(fromL, 4)} -> ${pad(toL, 4)}${noop ? '   (no change)' : ''}`,
  );
  // What this weight means in money, printed so the arithmetic is reviewed
  // rather than trusted: unit price × branch weight is what one شاخه costs,
  // and it must land where مرکزآهن's own per-شاخه maths lands.
  if (p.weight !== null && p.row.price !== null) {
    const perBranch = Math.round(Number(p.row.price) * p.weight);
    console.log(
      `                 ${pad('', 30)} ${Number(p.row.price).toLocaleString('en-US')} T/kg x ${p.weight} kg = ${perBranch.toLocaleString('en-US')} T per 12m branch`,
    );
  }
}

if (!APPLY) {
  console.log(`\n[hash] DRY RUN — ${changes} row(s) would change. Nothing written. Re-run with --apply.`);
  await pool.end();
  process.exit(0);
}

let written = 0;
for (const p of plans) {
  const res = await pool.query(
    `UPDATE skus
        SET theoretical_weight_kg = $2, branch_length_m = $3, updated_at = now()
      WHERE id = $1
        AND (theoretical_weight_kg IS DISTINCT FROM $2 OR branch_length_m IS DISTINCT FROM $3)`,
    [p.row.id, p.weight, p.length],
  );
  written += res.rowCount ?? 0;
}
console.log(`\n[hash] APPLIED — ${written} row(s) updated.`);
await pool.end();
