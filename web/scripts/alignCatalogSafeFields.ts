/**
 * One-shot safe catalog field completion from the approved ahanonline audit.
 *
 * Why these rows, and only these rows
 * -----------------------------------
 * Every write below has a direct physical/source fact behind it:
 *
 * - the five live HEB rows name HEB in their own product name but left the
 *   structured `standard` empty;
 * - the five domestic مانیسمان weights exactly reproduce ASME schedule
 *   40 over a 6 m branch;
 * - ahanonline publishes 12 m for every listed spiral row except Kaloup 32×8,
 *   which it publishes as 6 m;
 * - the stainless angle/channel thicknesses are explicit source dimensions;
 * - all nine copper sheets are 660×2000 and supplied as «شیت»;
 * - the existing main-sheet «رول»/«برش خورده» values and any
 *   چهارپهلو «نرمال»/«ترانس» values are conditions, not alloys.
 *   They move to the new independent column without changing their text.
 *
 * Prices, price history, units, activation and URLs are not selected for
 * update and cannot change here. Ambiguous sheet/profile/pipe rows are absent
 * by design.
 *
 * Safety
 * ------
 * - dry-run by default; pass --apply to write;
 * - one transaction for every write;
 * - exact slug/count and old-value guards abort on drift;
 * - idempotent: target values are accepted and a second run is a no-op.
 *
 *   ./node_modules/.bin/tsx scripts/alignCatalogSafeFields.ts
 *   ./node_modules/.bin/tsx scripts/alignCatalogSafeFields.ts --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[catalog-safe] DATABASE_URL is not set.');
  process.exit(1);
}

type MutableField =
  | 'standard'
  | 'schedule'
  | 'branch_length_m'
  | 'dimensions'
  | 'grade'
  | 'condition';
type Value = string | number | null;
type Plan = {
  slug: string;
  reason: string;
  set: Partial<Record<MutableField, Value>>;
  /** Allowed values before the migration, including the target for reruns. */
  allow: Partial<Record<MutableField, readonly Value[]>>;
};

const plan: Plan[] = [];
const add = (entry: Plan) => plan.push(entry);

for (const slug of [
  'ibeam-heb-16',
  'ibeam-heb-17',
  'ibeam-heb-18',
  'ibeam-heb-19',
  'ibeam-heb-20',
]) {
  add({
    slug,
    reason: 'HEB designation already present in the product identity',
    set: { standard: 'HEB' },
    allow: { standard: [null, 'HEB'] },
  });
}

for (const slug of [
  'pipe-seamless-1',
  'pipe-seamless-2',
  'pipe-seamless-3',
  'pipe-seamless-4',
  'pipe-seamless-5',
]) {
  add({
    slug,
    reason: 'published schedule-40 6 m weight',
    set: { schedule: '۴۰', branch_length_m: 6 },
    allow: { schedule: [null, '۴۰'], branch_length_m: [null, 6] },
  });
}

const SPIRAL_LENGTHS: Readonly<Record<string, number>> = {
  'pipe-spiral-16-t6-nvrd-lvlh-v-pvshsh-nyzar': 12,
  'pipe-spiral-16-t6-kalvp': 12,
  'pipe-spiral-18-t6-nvrd-lvlh-v-pvshsh-nyzar': 12,
  'pipe-spiral-18-t6-kalvp': 12,
  'pipe-spiral-20-t6-nvrd-lvlh-v-pvshsh-nyzar': 12,
  'pipe-spiral-20-t6-kalvp': 12,
  'pipe-spiral-24-t6-nvrd-lvlh-v-pvshsh-nyzar': 12,
  'pipe-spiral-24-t6-kalvp': 12,
  'pipe-spiral-32-t8-nvrd-lvlh-v-pvshsh-nyzar': 12,
  'pipe-spiral-32-t8-kalvp': 6,
  'pipe-spiral-42-t8-nvrd-lvlh-v-pvshsh-nyzar': 12,
  'pipe-spiral-48-t8-nvrd-lvlh-v-pvshsh-nyzar': 12,
};
for (const [slug, length] of Object.entries(SPIRAL_LENGTHS)) {
  add({
    slug,
    reason: 'source-published spiral branch length',
    set: { branch_length_m: length },
    allow: { branch_length_m: [null, length] },
  });
}

const STEEL_THICKNESS: Readonly<Record<string, string>> = {
  'steel-angle-20x20-304-chyn': '۳',
  'steel-angle-30x30-304-chyn': '۳',
  'steel-angle-40x40-304-chyn': '۴',
  'steel-angle-50x50-304-chyn': '۵',
  'steel-angle-80x80-304-chyn': '۸',
  'steel-channel-4-304l-tayvan': '۴',
  'steel-channel-5-304l-tayvan': '۵',
  'steel-channel-6-304l-tayvan': '۵',
  'steel-channel-8-304l-tayvan': '۵',
  'steel-channel-10-304l-tayvan': '۶',
  'steel-channel-12-304l-tayvan': '۶',
};
for (const [slug, thickness] of Object.entries(STEEL_THICKNESS)) {
  add({
    slug,
    reason: 'source-published stainless section thickness',
    set: { dimensions: thickness },
    allow: { dimensions: [null, thickness] },
  });
}

for (const size of ['0-7', '1', '2', '3', '4', '5', '6', '7', '10']) {
  const slug = `felezat-rangi-copper-sheet-${size}-bahnr`;
  add({
    slug,
    reason: 'source-published copper sheet dimensions and supplied condition',
    set: { dimensions: '۶۶۰×۲۰۰۰', condition: 'شیت' },
    allow: { dimensions: [null, '۶۶۰×۲۰۰۰'], condition: [null, 'شیت'] },
  });
}

const LEGACY_SHEET_CONDITIONS: Readonly<Record<string, string>> = {
  'sheet-2-brsh-khvrdh-mobarakeh-2': 'برش خورده',
  'sheet-2-rvl-mobarakeh': 'رول',
  'sheet-2-rvl-mobarakeh-2': 'رول',
  'sheet-2-brsh-khvrdh-mobarakeh': 'برش خورده',
  'sheet-3-brsh-khvrdh-mobarakeh-2': 'برش خورده',
  'sheet-3-rvl-mobarakeh-3': 'رول',
  'sheet-3-brsh-khvrdh-mobarakeh-3': 'برش خورده',
  'sheet-3-rvl-mobarakeh': 'رول',
  'sheet-3-rvl-mobarakeh-2': 'رول',
  'sheet-3-brsh-khvrdh-mobarakeh': 'برش خورده',
  'sheet-4-rvl-mobarakeh-3': 'رول',
  'sheet-4-brsh-khvrdh-mobarakeh': 'برش خورده',
  'sheet-4-brsh-khvrdh-mobarakeh-2': 'برش خورده',
  'sheet-4-brsh-khvrdh-mobarakeh-3': 'برش خورده',
  'sheet-4-rvl-mobarakeh': 'رول',
  'sheet-4-rvl-mobarakeh-2': 'رول',
};
for (const [slug, condition] of Object.entries(LEGACY_SHEET_CONDITIONS)) {
  add({
    slug,
    reason: 'verified legacy sheet condition moved out of grade',
    set: { grade: null, condition },
    allow: { grade: [condition, null], condition: [null, condition] },
  });
}

type Row = Record<MutableField, Value> & { id: string; slug: string; name: string; sub: string };
const pool = new pg.Pool({ connectionString: url, max: 1 });

// چهارپهلو is the other known condition/grade collision. It is
// discovered by taxonomy because those SKUs may be inactive, but only the two
// explicitly documented condition values are eligible; any other populated
// grade aborts rather than being guessed.
const { rows: fourSquareRows } = await pool.query<Row>(
  `SELECT s.id, s.slug, s.name, sc.slug AS sub, s.standard, s.schedule,
          s.branch_length_m, s.dimensions, s.grade, s.condition
     FROM skus s
     JOIN sub_categories sc ON sc.id = s.sub_category_id
     JOIN categories c ON c.id = s.category_id
    WHERE c.slug = 'profile' AND sc.slug = 'chaharpahlu'
    ORDER BY s.slug`,
);
for (const row of fourSquareRows) {
  const known = row.condition ?? row.grade;
  if (known == null) continue;
  if (known !== 'نرمال' && known !== 'ترانس') {
    throw new Error(
      `[catalog-safe] ABORT — ${row.slug} has unrecognized چهارپهلو grade/condition «${known}».`,
    );
  }
  add({
    slug: row.slug,
    reason: 'verified چهارپهلو condition moved out of grade',
    set: { grade: null, condition: known },
    allow: { grade: [known, null], condition: [null, known] },
  });
}

const { rows } = await pool.query<Row>(
  `SELECT s.id, s.slug, s.name, sc.slug AS sub, s.standard, s.schedule,
          s.branch_length_m, s.dimensions, s.grade, s.condition
     FROM skus s
     JOIN sub_categories sc ON sc.id = s.sub_category_id
    WHERE s.slug = ANY($1)
    ORDER BY s.slug`,
  [plan.map((p) => p.slug)],
);
const bySlug = new Map(rows.map((row) => [row.slug, row]));
const missing = plan.filter((item) => !bySlug.has(item.slug));
if (missing.length) {
  console.error(`[catalog-safe] ABORT — ${missing.length} expected slug(s) missing:`);
  for (const item of missing) console.error(`  ${item.slug}`);
  await pool.end();
  process.exit(1);
}

const equal = (a: Value, b: Value) => a === b || (typeof a === 'number' && Number(a) === Number(b));
for (const item of plan) {
  const row = bySlug.get(item.slug)!;
  for (const [field, allowed] of Object.entries(item.allow) as Array<
    [MutableField, readonly Value[]]
  >) {
    if (!allowed.some((value) => equal(row[field], value))) {
      console.error(
        `[catalog-safe] ABORT — ${item.slug}.${field} is ${JSON.stringify(row[field])}; expected one of ${JSON.stringify(allowed)}.`,
      );
      await pool.end();
      process.exit(1);
    }
  }
}

const changes = plan.filter((item) => {
  const row = bySlug.get(item.slug)!;
  return (Object.entries(item.set) as Array<[MutableField, Value]>).some(
    ([field, value]) => !equal(row[field], value),
  );
});

console.log(`[catalog-safe] ${plan.length} guarded SKU(s); ${changes.length} to change.\n`);
for (const item of changes) {
  const row = bySlug.get(item.slug)!;
  const fields = (Object.entries(item.set) as Array<[MutableField, Value]>)
    .filter(([field, value]) => !equal(row[field], value))
    .map(([field, value]) => `${field}: ${JSON.stringify(row[field])} → ${JSON.stringify(value)}`)
    .join(', ');
  console.log(`  ${item.slug}  ${fields}  (${item.reason})`);
}

if (!changes.length) {
  console.log('[catalog-safe] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}
if (!APPLY) {
  console.log('\n[catalog-safe] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Re-read and lock every target after BEGIN. The dry-run snapshot above is
  // useful output, but it is not authority to write: an admin or sync job may
  // have edited a row in between. Re-running the same old-value guards under
  // row locks makes the transaction abort on that drift instead of silently
  // overwriting it.
  const { rows: lockedRows } = await client.query<Row>(
    `SELECT s.id, s.slug, s.name, sc.slug AS sub, s.standard, s.schedule,
            s.branch_length_m, s.dimensions, s.grade, s.condition
       FROM skus s
       JOIN sub_categories sc ON sc.id = s.sub_category_id
      WHERE s.slug = ANY($1)
      ORDER BY s.slug
      FOR UPDATE OF s`,
    [plan.map((p) => p.slug)],
  );
  const lockedBySlug = new Map(lockedRows.map((row) => [row.slug, row]));
  if (lockedBySlug.size !== plan.length) {
    throw new Error(
      `[catalog-safe] ABORT — target count changed before lock (${lockedBySlug.size}/${plan.length}).`,
    );
  }
  for (const item of plan) {
    const row = lockedBySlug.get(item.slug)!;
    for (const [field, allowed] of Object.entries(item.allow) as Array<
      [MutableField, readonly Value[]]
    >) {
      if (!allowed.some((value) => equal(row[field], value))) {
        throw new Error(
          `[catalog-safe] ABORT — locked ${item.slug}.${field} is ${JSON.stringify(row[field])}; expected one of ${JSON.stringify(allowed)}.`,
        );
      }
    }
  }
  const lockedChanges = plan.filter((item) => {
    const row = lockedBySlug.get(item.slug)!;
    return (Object.entries(item.set) as Array<[MutableField, Value]>).some(
      ([field, value]) => !equal(row[field], value),
    );
  });
  for (const item of lockedChanges) {
    const row = lockedBySlug.get(item.slug)!;
    const next = { ...row, ...item.set };
    await client.query(
      `UPDATE skus
          SET standard = $2, schedule = $3, branch_length_m = $4,
              dimensions = $5, grade = $6, condition = $7, updated_at = now()
        WHERE id = $1`,
      [
        row.id,
        next.standard,
        next.schedule,
        next.branch_length_m,
        next.dimensions,
        next.grade,
        next.condition,
      ],
    );
  }
  await client.query('COMMIT');
  console.log(
    `\n[catalog-safe] APPLIED — ${lockedChanges.length} SKU(s) updated; no price or URL fields touched.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
