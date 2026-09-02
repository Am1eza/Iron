/**
 * One-off, re-runnable data fill for the two sub-categories whose new
 * `skus.dimensions` column can be filled from evidence rather than guessed.
 *
 * ## Why
 *
 * The 1405/06/09 column-taxonomy pass wired three facts every live source
 * publishes and this catalog did not: ورق's «عرض», لوله's «ضخامت», and
 * وال‌پست's «بال» (see catalogLabels' `SHEET_WIDTH_SUBS`,
 * `PIPE_THICKNESS_SUBS`, `VAL_POST_FLANGE_SUBS`). All three read the one
 * shared `skus.dimensions` column, which is NULL on every row of all of them.
 *
 * The house convention is to wire the published column and let it read
 * «نامشخص» until an admin fills it, rather than fabricate a value. This script
 * is the exception where the value is not a fabrication because the row itself
 * or its source already states it. Two cases qualify; nothing else here does:
 *
 * 1. **لوله اسپیرال — «ضخامت», out of the row's own name.** All 12 live
 *    اسپیرال SKUs are named «لوله اسپیرال ۱۶ اینچ **ضخامت ۶** نورد لوله …».
 *    The gauge is already recorded, in the one place nothing can query it.
 *    That is an extraction, not a collection.
 *
 * 2. **وال‌پست — «بال ۷», out of the source, matched row-for-row.**
 *    ahanonline `/نبشی-و-ناودانی/وال-پست/` (fetched 1405/06/09, «تاریخ
 *    بروزرسانی» 1405/6/9) renders «بال | ضخامت | سایز» over 8 priced rows,
 *    every «بال» cell reading 7, over exactly the 8 sections this catalog
 *    carries: 10×20، 10×30، 10×40، 15×20، 15×40، 15×300، 20×40، 20×300. The
 *    set matches on both sides with nothing left over, so 7 is not a value
 *    picked for our rows — it is the value published for these rows.
 *
 * **Deliberately NOT filled: every other new column.** The six remaining لوله
 * subs and the four ورق lines have real gaps, not derivable ones — their
 * sources price the SAME size at two or three different walls (ahanonline's
 * لوله صنعتی lists ½ اینچ at both 2 and 2.5 mm) and the same thickness at both
 * 1000 and 1250 mm width. There is nothing to derive from a size alone, and a
 * guessed wall is worse than an admitted «نامشخص». They are admin work, and
 * the drawer now offers the box under the right name for it.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one transaction; the full report is printed before it
 *   · every write is by primary key, setting only `dimensions` + updated_at
 *   · never overwrites: any row that already has a `dimensions` value is
 *     skipped and reported — an admin's own number always wins
 *   · وال‌پست writes only where the section is one of the 8 the source
 *     publishes; an unrecognised size is skipped, not given the same 7
 *   · اسپیرال writes only what its own name states; a row without the
 *     «ضخامت N» token is skipped, never given a sibling's gauge
 *   · idempotent: a second run re-reads the database and finds nothing
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/fillSourcedDimensions.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[dimensions] DATABASE_URL is not set.');
  process.exit(1);
}

/** «… ۱۶ اینچ ضخامت ۶ نورد لوله …» → «۶». Persian or Latin digits, with an
 *  optional decimal part; the token must be a whole word so «ضخامت» inside a
 *  longer word cannot match. */
const SPIRAL_THICKNESS = /ضخامت[\s‌]+([۰-۹0-9]+(?:[.٫][۰-۹0-9]+)?)/;

/** The flange width ahanonline publishes for وال‌پست, and the exact 8 sections
 *  it publishes it for. Sizes are compared digit-normalised (`normaliseSection`), so a
 *  row stored «۱۰×۲۰» matches the source's «10*20» and neither the separator
 *  nor the digit script can cause a silent miss. */
const VAL_POST_FLANGE = '۷';
const VAL_POST_SECTIONS = new Set(
  ['10*20', '10*30', '10*40', '15*20', '15*40', '15*300', '20*40', '20*300'].map(normaliseSection),
);

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Latin digits, one separator spelling, no spaces — the shape both sides of
 *  the وال‌پست match are reduced to before comparison. */
function normaliseSection(v: string): string {
  return v
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[×xX*✕]/g, '*')
    .replace(/\s/g, '')
    .trim();
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  name: string;
  cat: string;
  sub: string;
  size: string | null;
  dimensions: string | null;
};

const { rows } = await pool.query<Row>(
  `SELECT k.id, k.name, c.slug AS cat, sc.slug AS sub, k.size, k.dimensions
     FROM skus k
     JOIN sub_categories sc ON sc.id = k.sub_category_id
     JOIN categories c ON c.id = k.category_id
      AND ((c.slug = 'pipe' AND sc.slug = 'spiral')
        OR (c.slug = 'angle-channel' AND sc.slug = 'val-post'))
    ORDER BY c.slug, sc.slug, k.name`,
);

if (rows.length === 0) {
  console.error('[dimensions] no active اسپیرال or وال‌پست SKUs — aborting rather than guessing.');
  await pool.end();
  process.exit(1);
}

/** The value this row's own evidence states, or a reason there is none. */
function resolve(r: Row): { value: string } | { skip: string } {
  if (r.dimensions != null && r.dimensions.trim() !== '') {
    return {
      skip: `already has dimensions = «${r.dimensions}» — an admin's value is never overwritten`,
    };
  }
  if (r.sub === 'spiral') {
    const m = SPIRAL_THICKNESS.exec(r.name);
    if (!m) return { skip: `name states no «ضخامت N»: «${r.name}»` };
    return { value: m[1]! };
  }
  // val-post
  if (!r.size) return { skip: 'no size to match against the source’s 8 sections' };
  if (!VAL_POST_SECTIONS.has(normaliseSection(r.size))) {
    return { skip: `section «${r.size}» is not one ahanonline publishes a بال for` };
  }
  return { value: VAL_POST_FLANGE };
}

const writes: { r: Row; value: string }[] = [];
const skips: { r: Row; why: string }[] = [];
for (const r of rows) {
  const out = resolve(r);
  if ('skip' in out) skips.push({ r, why: out.skip });
  else writes.push({ r, value: out.value });
}

console.log(`\n[dimensions] ${rows.length} active SKU(s) in scope.\n`);
console.log(`── dimensions to write — ${writes.length} row(s) ─────────────`);
for (const { r, value } of writes) {
  const label = r.sub === 'spiral' ? 'ضخامت' : 'بال';
  console.log(`  ${r.sub.padEnd(9)} ${label} = ${value.padEnd(5)} ${r.name}`);
}
console.log(`\n── skipped — ${skips.length} row(s) ─────────────`);
for (const { r, why } of skips) console.log(`  ${r.sub.padEnd(9)} ${r.name}: ${why}`);

if (!APPLY) {
  console.log('\n[dimensions] DRY RUN — nothing written. Re-run with --apply.\n');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const { r, value } of writes) {
    await client.query(`UPDATE skus SET dimensions = $2, updated_at = now() WHERE id = $1`, [
      r.id,
      value,
    ]);
  }
  await client.query('COMMIT');
  console.log(`\n[dimensions] applied: ${writes.length} row(s).\n`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('[dimensions] rolled back:', e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
