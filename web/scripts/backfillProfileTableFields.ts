/**
 * Backfill the verified structured fields used by the live profile tables.
 *
 * Source audit (ahanonline, 1405/06/08)
 * ------------------------------------
 * The three profile families with active, visible prices in this catalog are
 * industrial, furniture/light and galvanized. Their source tables publish a
 * wall thickness and a 6 m supplied length separately from the section size.
 * The existing Ahantime rows stored only the section size; `skus.dimensions`
 * and `skus.branch_length_m` already exist, so no schema migration is needed.
 *
 * Only facts with a clean match are written:
 *
 * - industrial 80×80 at the current mirrored price maps to thickness 5 mm;
 * - galvanized 20×20 and 30×30 at their current mirrored price map to 2 mm;
 * - every source variant for all seven target section sizes is 6 m, so length
 *   is safe even where several thicknesses share the same price.
 *
 * Furniture 60×60 and galvanized 40×40/40×80/50×50 have ambiguous thickness
 * matches and are deliberately left null. Prices, history, names, activation,
 * taxonomy and URLs are never selected for update.
 *
 * Safety
 * ------
 * - dry-run by default; pass --apply to write;
 * - one transaction for every write;
 * - exact slug/sub/size/active and old-value guards abort on drift;
 * - price guards apply only while a source-matched thickness still needs to
 *   be written, so a completed run remains idempotent after later price moves.
 *
 *   ./node_modules/.bin/tsx scripts/backfillProfileTableFields.ts
 *   ./node_modules/.bin/tsx scripts/backfillProfileTableFields.ts --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[profile-fields] DATABASE_URL is not set.');
  process.exit(1);
}

type Plan = {
  slug: string;
  sub: 'prvfyl-snaty' | 'profil-mobli' | 'profil-galvanizeh';
  size: string;
  dimensions?: string;
  /** Required only to prove an otherwise ambiguous source thickness match. */
  sourcePrice?: number;
};

const PLAN: readonly Plan[] = [
  {
    slug: 'profile-80x80',
    sub: 'prvfyl-snaty',
    size: '۸۰×۸۰',
    dimensions: '۵',
    sourcePrice: 117_273,
  },
  { slug: 'profile-furniture-31', sub: 'profil-mobli', size: '۶۰×۶۰' },
  {
    slug: 'profile-galvanized-36',
    sub: 'profil-galvanizeh',
    size: '۲۰×۲۰',
    dimensions: '۲',
    sourcePrice: 177_727,
  },
  {
    slug: 'profile-galvanized-37',
    sub: 'profil-galvanizeh',
    size: '۳۰×۳۰',
    dimensions: '۲',
    sourcePrice: 177_727,
  },
  { slug: 'profile-galvanized-38', sub: 'profil-galvanizeh', size: '۴۰×۴۰' },
  { slug: 'profile-galvanized-39', sub: 'profil-galvanizeh', size: '۴۰×۸۰' },
  { slug: 'profile-galvanized-40', sub: 'profil-galvanizeh', size: '۵۰×۵۰' },
] as const;

type Row = {
  id: string;
  slug: string;
  sub: string;
  size: string | null;
  dimensions: string | null;
  branch_length_m: number | null;
  price: number | null;
  price_hidden: boolean | null;
};

const pool = new pg.Pool({ connectionString: url, max: 1 });

async function readRows(client: pg.Pool | pg.PoolClient, lock = false): Promise<Row[]> {
  const { rows } = await client.query<Row>(
    `SELECT s.id, s.slug, sc.slug AS sub, s.size,
            s.dimensions, s.branch_length_m, cp.price, cp.price_hidden
       FROM skus s
       JOIN sub_categories sc ON sc.id = s.sub_category_id
       JOIN categories c ON c.id = s.category_id
       LEFT JOIN current_prices cp ON cp.sku_id = s.id
      WHERE c.slug = 'profile' AND s.slug = ANY($1)
      ORDER BY s.slug
      ${lock ? 'FOR UPDATE OF s' : ''}`,
    [PLAN.map((item) => item.slug)],
  );
  return rows;
}

function validate(rows: readonly Row[]): Map<string, Row> {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  if (bySlug.size !== PLAN.length) {
    const missing = PLAN.filter((item) => !bySlug.has(item.slug)).map((item) => item.slug);
    throw new Error(
      `[profile-fields] ABORT — expected ${PLAN.length} target rows, found ${bySlug.size}; missing: ${missing.join(', ') || 'unknown duplicate/drift'}.`,
    );
  }

  for (const item of PLAN) {
    const row = bySlug.get(item.slug)!;
    if (row.sub !== item.sub || row.size !== item.size) {
      throw new Error(
        `[profile-fields] ABORT — ${item.slug} identity drift: sub=${row.sub}, size=${row.size}.`,
      );
    }
    if (row.branch_length_m !== null && Number(row.branch_length_m) !== 6) {
      throw new Error(
        `[profile-fields] ABORT — ${item.slug}.branch_length_m is ${row.branch_length_m}; expected null or 6.`,
      );
    }
    if (item.dimensions && row.dimensions !== null && row.dimensions !== item.dimensions) {
      throw new Error(
        `[profile-fields] ABORT — ${item.slug}.dimensions is ${JSON.stringify(row.dimensions)}; expected null or ${JSON.stringify(item.dimensions)}.`,
      );
    }
    if (
      item.dimensions &&
      row.dimensions === null &&
      (Number(row.price) !== item.sourcePrice || row.price_hidden === true)
    ) {
      throw new Error(
        `[profile-fields] ABORT — ${item.slug} no longer has the audited visible price ${item.sourcePrice}; re-verify its thickness before writing.`,
      );
    }
  }
  return bySlug;
}

function changes(bySlug: ReadonlyMap<string, Row>): Plan[] {
  return PLAN.filter((item) => {
    const row = bySlug.get(item.slug)!;
    return (
      Number(row.branch_length_m) !== 6 || (item.dimensions && row.dimensions !== item.dimensions)
    );
  });
}

const snapshot = validate(await readRows(pool));
const pending = changes(snapshot);

console.log(`[profile-fields] ${PLAN.length} guarded SKU(s); ${pending.length} to change.\n`);
for (const item of pending) {
  const row = snapshot.get(item.slug)!;
  const fields = [
    Number(row.branch_length_m) === 6
      ? null
      : `branch_length_m: ${JSON.stringify(row.branch_length_m)} → 6`,
    item.dimensions && row.dimensions !== item.dimensions
      ? `dimensions: ${JSON.stringify(row.dimensions)} → ${JSON.stringify(item.dimensions)}`
      : null,
  ].filter(Boolean);
  console.log(`  ${item.slug}  ${fields.join(', ')}`);
}

if (!pending.length) {
  console.log('[profile-fields] nothing to do — already applied.');
  await pool.end();
  process.exit(0);
}
if (!APPLY) {
  console.log('\n[profile-fields] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const locked = validate(await readRows(client, true));
  const lockedPending = changes(locked);
  for (const item of lockedPending) {
    const row = locked.get(item.slug)!;
    await client.query(
      `UPDATE skus
          SET branch_length_m = 6,
              dimensions = $2,
              updated_at = now()
        WHERE id = $1`,
      [row.id, item.dimensions ?? row.dimensions],
    );
  }
  await client.query('COMMIT');
  console.log(
    `\n[profile-fields] APPLIED — ${lockedPending.length} SKU(s) updated; no price, taxonomy or URL fields touched.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
