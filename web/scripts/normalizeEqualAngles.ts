/**
 * Normalize only the four evidence-backed equal-leg angle SKUs.
 *
 * Why these four
 * --------------
 * The live rows call their size «۶/۸/۱۰/۱۲», a centimetre shorthand that
 * loses both the second equal leg and thickness. Their existing 6 m branch
 * weights match the physical sections 60×60×6, 80×80×8, 100×100×10 and
 * 120×120×12 respectively, so those full millimetre dimensions are defensible
 * without changing the product or its price. Rows ۱۴/۱۶/۱۸, unequal-leg angle
 * and لقمه have no equivalent evidence and are intentionally absent.
 *
 * Each changed SKU slug receives an old-page → new-page permanent redirect.
 * Middleware maps `permanent = true` to HTTP 308. Price tables/history are
 * never selected for update; only SKU size/name/slug and redirects can change.
 *
 * Safety
 * ------
 * - dry-run by default; pass --apply to write;
 * - exact category/sub, activation, factory, length and weight guards;
 * - one transaction with row locks and collision checks;
 * - existing redirects must be absent or already exactly correct;
 * - idempotent: canonical rows and redirects make a second run a no-op.
 *
 *   ./node_modules/.bin/tsx scripts/normalizeEqualAngles.ts
 *   ./node_modules/.bin/tsx scripts/normalizeEqualAngles.ts --apply
 */
import pg from 'pg';
import { ulid } from 'ulid';
import {
  EQUAL_ANGLE_NORMALIZATION,
  equalAnglePath,
} from '../src/lib/data/catalogAngleNormalization';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[equal-angle] DATABASE_URL is not set.');
  process.exit(1);
}

type Row = {
  id: string;
  slug: string;
  name: string;
  size: string | null;
  factory: string | null;
  theoretical_weight_kg: string | number | null;
  branch_length_m: string | number | null;
  is_active: boolean;
  category_slug: string;
  sub_slug: string;
};
type RedirectRow = { from_path: string; to_path: string; permanent: boolean };

const pool = new pg.Pool({ connectionString: url, max: 1 });
const allSlugs = EQUAL_ANGLE_NORMALIZATION.flatMap((item) => [item.oldSlug, item.newSlug]);

function assertRow(item: (typeof EQUAL_ANGLE_NORMALIZATION)[number], row: Row): void {
  const canonical = row.slug === item.newSlug;
  const expectedSize = canonical ? item.newSize : item.oldSize;
  const expectedName = canonical ? item.newName : item.oldName;
  const weight = Number(row.theoretical_weight_kg);
  const length = Number(row.branch_length_m);
  const failures = [
    row.category_slug === 'angle-channel' ? null : `category=${row.category_slug}`,
    row.sub_slug === 'nabshi' ? null : `sub=${row.sub_slug}`,
    row.is_active ? null : 'inactive',
    row.size === expectedSize ? null : `size=${JSON.stringify(row.size)}`,
    row.name === expectedName ? null : `name=${JSON.stringify(row.name)}`,
    row.factory === item.factory ? null : `factory=${JSON.stringify(row.factory)}`,
    Math.abs(weight - item.theoreticalWeightKg) < 1e-6
      ? null
      : `weight=${JSON.stringify(row.theoretical_weight_kg)}`,
    Math.abs(length - 6) < 1e-9 ? null : `branch_length_m=${JSON.stringify(row.branch_length_m)}`,
  ].filter(Boolean);
  if (failures.length) {
    throw new Error(`[equal-angle] ABORT — ${row.slug}: ${failures.join(', ')}`);
  }
}

function resolveRows(rows: Row[]): Map<string, Row> {
  const resolved = new Map<string, Row>();
  for (const item of EQUAL_ANGLE_NORMALIZATION) {
    const matches = rows.filter((row) => row.slug === item.oldSlug || row.slug === item.newSlug);
    if (matches.length !== 1) {
      throw new Error(
        `[equal-angle] ABORT — expected exactly one of ${item.oldSlug}/${item.newSlug}; found ${matches.length}.`,
      );
    }
    assertRow(item, matches[0]!);
    resolved.set(item.oldSlug, matches[0]!);
  }
  return resolved;
}

function assertRedirects(rows: RedirectRow[]): Map<string, RedirectRow> {
  const byFrom = new Map(rows.map((row) => [row.from_path, row]));
  for (const item of EQUAL_ANGLE_NORMALIZATION) {
    const from = equalAnglePath(item.oldSlug);
    const row = byFrom.get(from);
    if (row && (row.to_path !== equalAnglePath(item.newSlug) || !row.permanent)) {
      throw new Error(
        `[equal-angle] ABORT — ${from} already redirects to ${row.to_path} (permanent=${row.permanent}).`,
      );
    }
  }
  return byFrom;
}

async function snapshot(client: pg.Pool | pg.PoolClient, lock = false) {
  const { rows } = await client.query<Row>(
    `SELECT s.id, s.slug, s.name, s.size, s.factory, s.theoretical_weight_kg,
            s.branch_length_m, s.is_active, c.slug AS category_slug,
            sc.slug AS sub_slug
       FROM skus s
       JOIN categories c ON c.id = s.category_id
       JOIN sub_categories sc ON sc.id = s.sub_category_id
      WHERE s.slug = ANY($1)
      ORDER BY s.slug
      ${lock ? 'FOR UPDATE OF s' : ''}`,
    [allSlugs],
  );
  const fromPaths = EQUAL_ANGLE_NORMALIZATION.map((item) => equalAnglePath(item.oldSlug));
  const redirectResult = await client.query<RedirectRow>(
    `SELECT from_path, to_path, permanent
       FROM redirects
      WHERE from_path = ANY($1)
      ${lock ? 'FOR UPDATE' : ''}`,
    [fromPaths],
  );
  return { byPlan: resolveRows(rows), redirects: assertRedirects(redirectResult.rows) };
}

const before = await snapshot(pool);
const rowChanges = EQUAL_ANGLE_NORMALIZATION.filter(
  (item) => before.byPlan.get(item.oldSlug)!.slug === item.oldSlug,
);
const redirectChanges = EQUAL_ANGLE_NORMALIZATION.filter(
  (item) => !before.redirects.has(equalAnglePath(item.oldSlug)),
);

console.log(
  `[equal-angle] ${EQUAL_ANGLE_NORMALIZATION.length} guarded SKU(s); ` +
    `${rowChanges.length} row rename(s), ${redirectChanges.length} redirect insert(s).\n`,
);
for (const item of rowChanges) {
  console.log(`  ${item.oldSize} → ${item.newSize}  ${item.oldSlug} → ${item.newSlug}`);
}
for (const item of redirectChanges) {
  console.log(`  308 ${equalAnglePath(item.oldSlug)} → ${equalAnglePath(item.newSlug)}`);
}

if (!rowChanges.length && !redirectChanges.length) {
  console.log('[equal-angle] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}
if (!APPLY) {
  console.log('\n[equal-angle] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const locked = await snapshot(client, true);
  let updated = 0;
  let inserted = 0;
  for (const item of EQUAL_ANGLE_NORMALIZATION) {
    const row = locked.byPlan.get(item.oldSlug)!;
    if (row.slug === item.oldSlug) {
      await client.query(
        `UPDATE skus
            SET slug = $2, size = $3, name = $4, updated_at = now()
          WHERE id = $1`,
        [row.id, item.newSlug, item.newSize, item.newName],
      );
      updated++;
    }
    const from = equalAnglePath(item.oldSlug);
    if (!locked.redirects.has(from)) {
      await client.query(
        `INSERT INTO redirects (id, from_path, to_path, permanent)
         VALUES ($1, $2, $3, true)`,
        [ulid(), from, equalAnglePath(item.newSlug)],
      );
      inserted++;
    }
  }
  await client.query('COMMIT');
  console.log(
    `\n[equal-angle] APPLIED — ${updated} SKU(s) normalized; ${inserted} permanent (308) redirect(s) inserted.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
