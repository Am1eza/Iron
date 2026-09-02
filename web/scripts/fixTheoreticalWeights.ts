/**
 * One-off migration: recompute `skus.theoretical_weight_kg` from the canonical
 * formula table, and NULL it wherever the catalog cannot derive one.
 *
 * ## What was wrong
 *
 * Every SKU seeded from `lib/mock/catalogData.ts` (via `scripts/seed.ts`) got
 * its weight from ONE line:
 *
 *     const weight = Math.round((faToInt(size) ** 2 / 162) * 12 * 10) / 10 || 10;
 *
 * That is `d²/162 × 12 m` — the ROUND-BAR formula — applied to whatever number
 * the SKU's `size` string happened to start with, for every category. Correct
 * for میلگرد. Nonsense for everything else, and the `|| 10` tail meant a size
 * that parsed to zero («ورق آجدار ۰.۷») was stored as a literal 10 kg:
 *
 *   · «نبشی ۱۰»           →   7.4 kg   (a 6 m L100×100×10 is 94.3 kg — 12.7× low)
 *   · «ناودانی ۱۰»         →   7.4 kg   (a 6 m UNP100 is ~64 kg)
 *   · «قوطی ۱۰۰×۱۰۰»       → 740.7 kg
 *   · «هاش سبک (HEA) ۱۴»   →  14.5 kg   (a 12 m HEA140 is ~296 kg)
 *   · «ورق روغنی ۱»        →   0.1 kg
 *   · «لوله ۱ اینچ»        →   0.1 kg
 *   · «ورق آجدار ۰.۷»      →  10   kg   (the `|| 10` fallback, not a formula)
 *
 * This is not cosmetic. `PriceTable` renders the value as «وزن شاخه» on a
 * public page, and `leads.service`/`estimate.service` multiply it by the
 * quantity when a piece-counted order is converted to kilograms for the
 * پیش‌فاکتور total.
 *
 * The generator is fixed in the same change (it now calls
 * `catalogCompose.theoreticalWeightFor`, which goes through the one canonical
 * `utils/weight.ts` table). This script repairs the rows already in the
 * database.
 *
 * ## What it writes — and what it refuses to touch
 *
 * It only rewrites a row whose stored weight IS the buggy formula's output,
 * reproduced bit-for-bit (`buggyWeight` below is the deleted line, kept here
 * as a fingerprint). Everything else is hand-entered or already-verified data
 * and is left alone, because "recompute everything from the table" would have
 * been a second, quieter version of the same mistake:
 *
 *   · the 25 branch-priced تیرآهن rows carry REAL per-mill weights (ذوب‌آهن ۱۴
 *     = 155 kg, یزد/فایکو/ظفر بناب ۱۴ = 135 kg — Iranian private mills roll
 *     تیرآهن lighter than ذوب‌آهن's standard section, and the 2026-08-19 pass
 *     cross-checked all nine ذوب‌آهن sizes against ahanonline's own per-kg ÷
 *     per-شاخه to within 2 %). Recomputing them from `IBEAM_KG_PER_M` would
 *     have pushed every non-ذوب‌آهن row up ~15 % on a per-شاخه product, i.e.
 *     straight onto a پیش‌فاکتور total.
 *   · the five لوله مانیسمان rows were corrected by hand on 2026-08-19 from
 *     ASME B36.10M sch40 over a 6 m branch.
 *
 * For a row that DOES carry the bug's fingerprint it re-derives the weight
 * with the same function the app now uses —
 * `theoreticalWeightFor(categorySlug, size, subSlug)` — and:
 *
 *   · writes the recomputed number where the product line has a published one;
 *   · writes NULL where it does not.
 *
 * NULL is the honest answer, not a gap: every consumer already handles it
 * («نامشخص» in the price table, no weight line on the card, `allPriced=false`
 * rather than a silent zero in the quote). The lines that get NULL, and why,
 * are documented on `CATALOG_WEIGHT_BASIS` in `lib/utils/catalogCompose.ts` —
 * in short, a قوطی needs a wall thickness, a ورق needs width × length and a
 * لوله needs a wall thickness, none of which this catalog stores; هاش/تیرآهن
 * سبک/لانه‌زنبوری are different sections from the IPE table the repo holds;
 * ناودانی سبک/سنگین are separate weight classes whose two public tables
 * disagree by ~11 %; and کلاف/مفتول are coils with no شاخه at all.
 *
 * ## Sources for the two lines that DO get a number
 *
 *   · نبشی — `ANGLE_KG_PER_M` in `lib/utils/weight.ts`, which is مرکزآهن's
 *     published جدول وزن نبشی (audited into that file on 2026-08-09 and
 *     re-confirmed for this change: 1.36 / 2.42 / 3.77 / 5.66 / 10.06 / 15.72
 *     / 22.63 kg per metre for legs 30…120 mm —
 *     https://www.markazeahan.com/جدول-وزن-نبشی/). Branch length 6 m: that is
 *     the «حالت» ahanonline quotes almost every row of its own نبشی listing in
 *     (https://ahanonline.com/product-category/نبشی-و-ناودانی/نبشی/ — ۱۲ متری
 *     exists but is the exception), and the length مرکزآهن's table leads with.
 *     Sizes outside the published table (نبشی ۱۴/۱۶/۱۸) get NULL rather than
 *     the geometric approximation, which drifts ~5 % at those legs.
 *
 *   · تیرآهن — `IBEAM_KG_PER_M` (same audited source) over a 12 m branch, the
 *     Iranian standard and the one the catalog's own existing branch-priced
 *     تیرآهن rows already encode (ذوب‌آهن ۱۴ is stored at 155 kg = 12.9 × 12).
 *     These rows are already correct and this script confirms rather than
 *     changes them.
 *
 * 6 m was deliberately NOT added to `DEFAULT_LENGTH_M` in `weight.ts`: both
 * 6 m and 12 m نبشی/ناودانی are genuinely sold, so it is a catalog-line
 * convention rather than a physical constant, and silently defaulting it in
 * the interactive وزن‌سنج is exactly what that table's comment refuses to do.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one UPDATE per row, by primary key, setting only `theoretical_weight_kg`
 *     and `updated_at`
 *   · the full old → new report is printed before any write
 *
 *     ./node_modules/.bin/tsx scripts/fixTheoreticalWeights.ts
 *     # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { theoreticalWeightFor } from '../src/lib/utils/catalogCompose';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[weights] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  name: string;
  size: string | null;
  unit: string;
  weight: string | null;
  cat: string;
  sub: string;
};

const { rows } = await pool.query<Row>(
  `SELECT s.id, s.name, s.size, s.unit,
          s.theoretical_weight_kg::text AS weight,
          c.slug AS cat, sc.slug AS sub
     FROM skus s
     JOIN categories c ON c.id = s.category_id
     JOIN sub_categories sc ON sc.id = s.sub_category_id
    ORDER BY c.slug, sc.slug, s.size, s.name`,
);

/**
 * The deleted line from `lib/mock/catalogData.ts`, reproduced exactly — this
 * is the fingerprint that identifies a machine-generated weight.
 *
 * Both halves matter and are deliberately NOT "improved":
 *   · `match(/\d+/)` takes the first INTEGER run, so «۵.۵» reads as 5 and
 *     «۴۰×۸۰» as 40 — that truncation is part of what produced the stored
 *     values, so replicating it is what makes the match exact.
 *   · `|| 10` turns a zero into a literal 10 kg, which is where «ورق آجدار
 *     ۰.۷ = ۱۰ kg» came from. Without it those rows would not be recognised.
 */
function buggyWeight(size: string | null): number {
  if (!size) return 10;
  const m = size.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/\d+/);
  const n = m ? Number(m[0]) : 10;
  return Math.round((n ** 2 / 162) * 12 * 10) / 10 || 10;
}

const fmt = (n: number | null) => (n === null ? 'NULL' : n.toFixed(1).padStart(8));
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

type Change = { row: Row; from: number | null; to: number | null };
const changes: Change[] = [];
const notGenerated: Row[] = [];
const alreadyRight: Row[] = [];

for (const r of rows) {
  const from = r.weight === null ? null : Number(r.weight);
  // Only rows the bug wrote. A null weight was never written by it (the
  // formula always produced a number), and a value that is not the formula's
  // output is hand-entered or already corrected — see the header.
  if (from === null || Math.abs(from - buggyWeight(r.size)) > 0.05) {
    notGenerated.push(r);
    continue;
  }
  const to = theoreticalWeightFor(r.cat, r.size ?? undefined, r.sub);
  if (to !== null && Math.abs(from - to) <= 0.05) {
    // The bug's output and the correct answer coincide — every میلگرد row,
    // where d²/162 × 12 m IS the right formula for round bar.
    alreadyRight.push(r);
    continue;
  }
  changes.push({ row: r, from, to });
}

console.log(`[weights] ${rows.length} sku(s) examined.`);
console.log(`[weights]   ${notGenerated.length} not written by the bug (null, hand-entered or already corrected) — untouched`);
console.log(`[weights]   ${alreadyRight.length} bug-written but coincidentally correct (round bar) — no write`);
console.log(`[weights]   ${changes.length} to change\n`);

// Every row the fingerprint spared that still HAS a weight, so the decision to
// leave it alone is visible and auditable rather than implicit.
const heldWithWeight = notGenerated.filter((r) => r.weight !== null);
console.log(`--- ${heldWithWeight.length} non-null weights left untouched (not the bug's output) ---`);
for (const r of heldWithWeight) {
  console.log(
    `  ${pad(`${r.cat}/${r.sub}`, 26)} ${pad(r.name, 38)} ${pad(r.size ?? '', 9)} ${pad(r.unit, 7)} ${fmt(Number(r.weight))}  (bug would have written ${buggyWeight(r.size).toFixed(1)})`,
  );
}
console.log('');

const corrected = changes.filter((c) => c.to !== null);
const nulled = changes.filter((c) => c.to === null);

console.log(`--- ${corrected.length} recomputed from a published table ---`);
for (const c of corrected) {
  console.log(
    `  ${pad(`${c.row.cat}/${c.row.sub}`, 30)} ${pad(c.row.name, 40)} ${pad(c.row.size ?? '', 10)} ${fmt(c.from)} → ${fmt(c.to)}`,
  );
}

console.log(`\n--- ${nulled.length} cleared to NULL (no derivable branch weight) ---`);
const byLine = new Map<string, Change[]>();
for (const c of nulled) {
  const k = `${c.row.cat}/${c.row.sub}`;
  byLine.set(k, [...(byLine.get(k) ?? []), c]);
}
for (const [line, cs] of [...byLine.entries()].sort()) {
  console.log(`  ${pad(line, 30)} ${String(cs.length).padStart(3)} row(s)`);
  for (const c of cs) {
    console.log(`      ${pad(c.row.name, 44)} ${pad(c.row.size ?? '', 10)} ${fmt(c.from)} → NULL`);
  }
}

if (!APPLY) {
  console.log('\n[weights] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

let written = 0;
for (const c of changes) {
  const res = await pool.query(
    `UPDATE skus SET theoretical_weight_kg = $2, updated_at = now() WHERE id = $1`,
    [c.row.id, c.to],
  );
  written += res.rowCount ?? 0;
}
console.log(`\n[weights] APPLIED — ${written} row(s) updated.`);
await pool.end();
