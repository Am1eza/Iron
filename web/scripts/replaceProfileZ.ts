/**
 * Replace the seven mislabeled box-profile rows under پروفیل Z.
 *
 * The existing 20×20 … 70×70 rows describe square/rectangular hollow
 * sections, not Z purlins. There is no defensible old→new product mapping, so
 * they are soft-retired in place and every old URL redirects permanently to
 * the پروفیل Z listing. No row is deleted and its price history remains tied
 * to the same SKU id.
 *
 * Eight real variants are inserted from the approved market table: heights
 * Z*16/18/20/22 at 2.5 and 3 mm. They are deliberately inactive and have no
 * current price or price history. Pricing and activation are a separate owner
 * workflow; this script cannot invent either.
 *
 * Safety
 * ------
 * - dry-run by default; pass --apply to write;
 * - exact old slug/name/size and taxonomy guards;
 * - one locked transaction; no DELETE and no price-table writes;
 * - new rows must be absent or exactly match the inactive/unpriced plan;
 * - redirects must be absent or already point permanently to the listing;
 * - idempotent: a second run is a no-op.
 *
 *   ./node_modules/.bin/tsx scripts/replaceProfileZ.ts
 *   ./node_modules/.bin/tsx scripts/replaceProfileZ.ts --apply
 */
import pg from 'pg';
import { ulid } from 'ulid';
import {
  PROFILE_Z_LISTING_PATH,
  RETIRED_PROFILE_Z,
  SEEDED_PROFILE_Z,
  retiredProfileZPath,
} from '../src/lib/data/catalogProfileZReplacement';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[profile-z] DATABASE_URL is not set.');
  process.exit(1);
}

type SkuRow = {
  id: string;
  slug: string;
  name: string;
  size: string | null;
  dimensions: string | null;
  standard: string | null;
  grade: string | null;
  condition: string | null;
  schedule: string | null;
  factory: string | null;
  branch_length_m: string | number | null;
  theoretical_weight_kg: string | number | null;
  image_url: string | null;
  order_num: number;
  unit: string;
  price_basis: string;
  is_active: boolean;
  category_slug: string;
  sub_slug: string;
};
type RedirectRow = { from_path: string; to_path: string; permanent: boolean };
type Taxonomy = { category_id: string; sub_id: string; category_active: boolean; sub_active: boolean };

const pool = new pg.Pool({ connectionString: url, max: 1 });

function assertOldRows(rows: SkuRow[]): Map<string, SkuRow> {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  if (rows.length !== RETIRED_PROFILE_Z.length) {
    throw new Error(
      `[profile-z] ABORT — found ${rows.length}/${RETIRED_PROFILE_Z.length} retired target rows.`,
    );
  }
  for (const item of RETIRED_PROFILE_Z) {
    const row = bySlug.get(item.slug);
    const failures = !row
      ? ['missing']
      : [
          row.category_slug === 'profile' ? null : `category=${row.category_slug}`,
          row.sub_slug === 'profil-z' ? null : `sub=${row.sub_slug}`,
          row.name === item.name ? null : `name=${JSON.stringify(row.name)}`,
          row.size === item.size ? null : `size=${JSON.stringify(row.size)}`,
        ].filter(Boolean);
    if (failures.length) {
      throw new Error(`[profile-z] ABORT — ${item.slug}: ${failures.join(', ')}`);
    }
  }
  return bySlug;
}

function assertNewRows(rows: SkuRow[]): Map<string, SkuRow> {
  const bySlug = new Map<string, SkuRow>();
  for (const item of SEEDED_PROFILE_Z) {
    const matches = rows.filter((row) => row.id === item.id || row.slug === item.slug);
    if (matches.length > 1) {
      throw new Error(`[profile-z] ABORT — id/slug collision for ${item.slug}.`);
    }
    const row = matches[0];
    if (!row) continue;
    const failures = [
      row.id === item.id ? null : `id=${row.id}`,
      row.slug === item.slug ? null : `slug=${row.slug}`,
      row.category_slug === 'profile' ? null : `category=${row.category_slug}`,
      row.sub_slug === 'profil-z' ? null : `sub=${row.sub_slug}`,
      row.name === item.name ? null : `name=${JSON.stringify(row.name)}`,
      row.size === item.size ? null : `size=${JSON.stringify(row.size)}`,
      row.dimensions === item.dimensions ? null : `dimensions=${JSON.stringify(row.dimensions)}`,
      row.standard == null ? null : `standard=${JSON.stringify(row.standard)}`,
      row.grade == null ? null : `grade=${JSON.stringify(row.grade)}`,
      row.condition == null ? null : `condition=${JSON.stringify(row.condition)}`,
      row.schedule == null ? null : `schedule=${JSON.stringify(row.schedule)}`,
      row.factory == null ? null : `factory=${JSON.stringify(row.factory)}`,
      row.branch_length_m == null
        ? null
        : `branch_length_m=${JSON.stringify(row.branch_length_m)}`,
      row.theoretical_weight_kg == null
        ? null
        : `theoretical_weight_kg=${JSON.stringify(row.theoretical_weight_kg)}`,
      row.image_url == null ? null : `image_url=${JSON.stringify(row.image_url)}`,
      row.order_num === 0 ? null : `order=${row.order_num}`,
      row.unit === 'kg' ? null : `unit=${row.unit}`,
      row.price_basis === 'kg' ? null : `price_basis=${row.price_basis}`,
      !row.is_active ? null : 'active',
    ].filter(Boolean);
    if (failures.length) {
      throw new Error(`[profile-z] ABORT — ${item.slug}: ${failures.join(', ')}`);
    }
    bySlug.set(item.slug, row);
  }
  return bySlug;
}

function assertRedirects(rows: RedirectRow[]): Map<string, RedirectRow> {
  const byFrom = new Map(rows.map((row) => [row.from_path, row]));
  for (const item of RETIRED_PROFILE_Z) {
    const from = retiredProfileZPath(item.slug);
    const row = byFrom.get(from);
    if (row && (row.to_path !== PROFILE_Z_LISTING_PATH || !row.permanent)) {
      throw new Error(
        `[profile-z] ABORT — ${from} redirects to ${row.to_path} (permanent=${row.permanent}).`,
      );
    }
  }
  return byFrom;
}

async function snapshot(client: pg.Pool | pg.PoolClient, lock = false) {
  const taxonomyResult = await client.query<Taxonomy>(
    `SELECT c.id AS category_id, sc.id AS sub_id,
            c.is_active AS category_active, sc.is_active AS sub_active
       FROM categories c
       JOIN sub_categories sc ON sc.category_id = c.id
      WHERE c.slug = 'profile' AND sc.slug = 'profil-z'`,
  );
  if (taxonomyResult.rows.length !== 1) {
    throw new Error(`[profile-z] ABORT — expected one active profile/profil-z taxonomy node.`);
  }
  const taxonomy = taxonomyResult.rows[0]!;
  if (!taxonomy.category_active || !taxonomy.sub_active) {
    throw new Error('[profile-z] ABORT — profile/profil-z taxonomy is inactive.');
  }

  const select = `SELECT s.id, s.slug, s.name, s.size, s.dimensions,
                         s.standard, s.grade, s.condition, s.schedule, s.factory,
                         s.branch_length_m, s.theoretical_weight_kg, s.image_url,
                         s."order" AS order_num, s.unit, s.price_basis, s.is_active,
                         c.slug AS category_slug,
                         sc.slug AS sub_slug
                    FROM skus s
                    JOIN categories c ON c.id = s.category_id
                    JOIN sub_categories sc ON sc.id = s.sub_category_id`;
  const oldResult = await client.query<SkuRow>(
    `${select} WHERE s.slug = ANY($1) ${lock ? 'FOR UPDATE OF s' : ''}`,
    [RETIRED_PROFILE_Z.map((item) => item.slug)],
  );
  const newResult = await client.query<SkuRow>(
    `${select} WHERE s.id = ANY($1) OR s.slug = ANY($2) ${lock ? 'FOR UPDATE OF s' : ''}`,
    [
      SEEDED_PROFILE_Z.map((item) => item.id),
      SEEDED_PROFILE_Z.map((item) => item.slug),
    ],
  );
  const newRows = assertNewRows(newResult.rows);

  const newIds = SEEDED_PROFILE_Z.map((item) => item.id);
  const priced = await client.query<{ sku_id: string }>(
    `SELECT sku_id FROM current_prices WHERE sku_id = ANY($1)
     UNION ALL
     SELECT sku_id FROM price_points WHERE sku_id = ANY($1)`,
    [newIds],
  );
  if (priced.rows.length) {
    throw new Error(
      `[profile-z] ABORT — planned inactive SKU(s) already have price data: ${priced.rows.map((row) => row.sku_id).join(', ')}`,
    );
  }

  const fromPaths = RETIRED_PROFILE_Z.map((item) => retiredProfileZPath(item.slug));
  const redirectResult = await client.query<RedirectRow>(
    `SELECT from_path, to_path, permanent FROM redirects
      WHERE from_path = ANY($1) ${lock ? 'FOR UPDATE' : ''}`,
    [fromPaths],
  );
  return {
    taxonomy,
    oldRows: assertOldRows(oldResult.rows),
    newRows,
    redirects: assertRedirects(redirectResult.rows),
  };
}

const before = await snapshot(pool);
const retire = RETIRED_PROFILE_Z.filter((item) => before.oldRows.get(item.slug)!.is_active);
const seed = SEEDED_PROFILE_Z.filter((item) => !before.newRows.has(item.slug));
const redirect = RETIRED_PROFILE_Z.filter(
  (item) => !before.redirects.has(retiredProfileZPath(item.slug)),
);

console.log(
  `[profile-z] ${RETIRED_PROFILE_Z.length} guarded legacy SKU(s); ` +
    `${retire.length} to retire, ${seed.length} inactive/unpriced SKU(s) to seed, ` +
    `${redirect.length} redirect(s) to insert.\n`,
);
for (const item of retire) console.log(`  retire ${item.slug}  (${item.size})`);
for (const item of seed) console.log(`  seed inactive ${item.slug}  ${item.size} / ${item.dimensions} mm`);
for (const item of redirect) {
  console.log(`  308 ${retiredProfileZPath(item.slug)} → ${PROFILE_Z_LISTING_PATH}`);
}

if (!retire.length && !seed.length && !redirect.length) {
  console.log('[profile-z] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}
if (!APPLY) {
  console.log('\n[profile-z] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const locked = await snapshot(client, true);
  let retired = 0;
  let seeded = 0;
  let redirected = 0;
  for (const item of RETIRED_PROFILE_Z) {
    const row = locked.oldRows.get(item.slug)!;
    if (row.is_active) {
      await client.query(`UPDATE skus SET is_active = false, updated_at = now() WHERE id = $1`, [
        row.id,
      ]);
      retired++;
    }
    const from = retiredProfileZPath(item.slug);
    if (!locked.redirects.has(from)) {
      await client.query(
        `INSERT INTO redirects (id, from_path, to_path, permanent)
         VALUES ($1, $2, $3, true)`,
        [ulid(), from, PROFILE_Z_LISTING_PATH],
      );
      redirected++;
    }
  }
  for (const item of SEEDED_PROFILE_Z) {
    if (locked.newRows.has(item.slug)) continue;
    await client.query(
      `INSERT INTO skus
         (id, category_id, sub_category_id, slug, name, size, dimensions,
          unit, price_basis, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'kg', 'kg', false)`,
      [
        item.id,
        locked.taxonomy.category_id,
        locked.taxonomy.sub_id,
        item.slug,
        item.name,
        item.size,
        item.dimensions,
      ],
    );
    seeded++;
  }
  await client.query('COMMIT');
  console.log(
    `\n[profile-z] APPLIED — ${retired} soft-retired; ${seeded} inactive/unpriced seeded; ` +
      `${redirected} permanent (308) redirects inserted.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
