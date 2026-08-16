/**
 * One-off backfill: real شمش فولاد (billet) price history for the exact spec
 * Amir asked for — آنالیز 5SP، ابعاد ۱۵۰×۱۵۰ میلیمتر، محل بارگیری اصفهان —
 * so the market board's chart for شمش فولاد has real data instead of the
 * "در حال بارگذاری نمودار…" empty state (zero rows existed for key='billet').
 *
 * Source: the exact same product listing on مرکزآهن (markazeahan.com,
 * product id 35694) — its own page embeds a `chart.last10` JSON blob with
 * real timestamps and prices for this precise SKU. Verified by hand,
 * 2026-08-16: 10 points, 2026-08-01 through 2026-08-15, matching the
 * declining-then-flat trend a real billet quote would show. No attribution
 * is written anywhere on our own site (Amir, 2026-08-15: "در سایت چیزی نگو
 * مردم خودشون میدونن") — this is only a data source for our own numbers,
 * the same way every Iranian steel-price site quotes roughly the same
 * publicly-known بورس کالا-derived rate without crediting each other.
 *
 * Deliberately NOT fabricated further back than this: markazeahan's own page
 * has no working 3-month/year range control (checked — no such tabs exist
 * for this listing, only the embedded last-10 blob), so there is no genuine
 * source for deeper history yet. Real data will keep accumulating going
 * forward via admin entry; this script does not invent anything to fill
 * that gap.
 *
 * Also sets the CURRENT market_values row for billet to the latest real
 * point (60,800 تومان/kg, 2026-08-15) — replacing the meaningless ۲۸۵,۰۰۰
 * placeholder that was never a real number (see 2026-08-14 note in
 * MarketBoard.tsx history / project memory).
 *
 * Safety:
 *   · dry run by default — pass --apply to write
 *   · idempotent: re-running skips any (key, at) pair that already exists
 *   · one transaction; full report printed before it
 *
 *   ./node_modules/.bin/tsx scripts/backfillBilletHistory.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../src/lib/server/db/schema';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[backfill-billet] DATABASE_URL is not set.');
  process.exit(1);
}

/** Verbatim from markazeahan.com product 35694's embedded chart.last10,
 *  2026-08-16 — شمش آنالیز 5SP، ۱۵۰×۱۵۰mm، اصفهان. Unix seconds → Toman/kg. */
const REAL_POINTS: Array<{ at: number; value: number }> = [
  { at: 1785590602, value: 61300 },
  { at: 1785675911, value: 61300 },
  { at: 1785759972, value: 61300 },
  { at: 1785937490, value: 61300 },
  { at: 1786008332, value: 61300 },
  { at: 1786194547, value: 60900 },
  { at: 1786280082, value: 60800 },
  { at: 1786366928, value: 60800 },
  { at: 1786455138, value: 60800 },
  { at: 1786799767, value: 60800 },
];

const pool = new pg.Pool({ connectionString: url, max: 3 });
const db = drizzle(pool, { schema });
const { marketPoints, marketValues } = schema;

async function main() {
  const existing = await db
    .select({ at: marketPoints.at, value: marketPoints.value })
    .from(marketPoints)
    .where(eq(marketPoints.key, 'billet'));
  const existingTimes = new Set(existing.map((r) => r.at.getTime()));

  const toInsert = REAL_POINTS.filter((p) => !existingTimes.has(p.at * 1000));
  const skipped = REAL_POINTS.length - toInsert.length;

  console.log(`[backfill-billet] ${existing.length} existing billet point(s) in DB.`);
  console.log(`[backfill-billet] ${toInsert.length} new point(s) to insert, ${skipped} already present.`);
  for (const p of toInsert) {
    console.log(`  · ${new Date(p.at * 1000).toISOString()} → ${p.value.toLocaleString('en-US')} تومان/kg`);
  }

  const latest = REAL_POINTS[REAL_POINTS.length - 1]!;
  const currentBefore = await db.select().from(marketValues).where(eq(marketValues.key, 'billet')).limit(1);
  console.log(
    `\n[backfill-billet] current market_values.billet: ${
      currentBefore[0] ? `${currentBefore[0].value.toLocaleString('en-US')} ${currentBefore[0].unit} (source=${currentBefore[0].source})` : '(none)'
    } → will become ${latest.value.toLocaleString('en-US')} تومان (source=admin)`,
  );

  if (!APPLY) {
    console.log('\n[backfill-billet] DRY RUN — nothing written. Re-run with --apply to write.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of toInsert) {
      await client.query(`INSERT INTO market_points (id, key, value, at) VALUES ($1, 'billet', $2, to_timestamp($3))`, [
        ulid(),
        p.value,
        p.at,
      ]);
    }

    // Same 24h-lookback rule as upsertMarketValue() in marketRepo.ts, applied
    // by hand here. Done through the SAME `client` (raw SQL, not drizzle): the
    // pool is max:1, so issuing a drizzle query while `client` holds the only
    // connection would deadlock. The reads sit inside the open transaction, so
    // they also see the rows just inserted above.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const beforeRef = await client.query<{ value: number }>(
      `SELECT value FROM market_points WHERE key='billet' AND at <= $1 ORDER BY at DESC LIMIT 1`,
      [since],
    );
    const earliest = await client.query<{ value: number }>(
      `SELECT value FROM market_points WHERE key='billet' ORDER BY at ASC LIMIT 1`,
    );
    const ref = beforeRef.rows[0]?.value ?? earliest.rows[0]?.value ?? null;

    let movementPct: number | null = null;
    let movementDir: 'up' | 'down' | 'flat' = 'flat';
    if (ref && ref > 0) {
      movementPct = Math.round(((latest.value - ref) / ref) * 10000) / 100;
      movementDir = movementPct > 0.005 ? 'up' : movementPct < -0.005 ? 'down' : 'flat';
    }

    const row = {
      key: 'billet' as const,
      label: 'شمش فولاد',
      value: latest.value,
      unit: 'تومان',
      source: 'admin' as const,
      movementDir,
      movementPct,
      updatedAt: new Date(),
      isStale: false,
    };
    await client.query(
      `INSERT INTO market_values (key, label, value, unit, source, movement_dir, movement_pct, updated_at, is_stale)
       VALUES ('billet', $1, $2, $3, 'admin', $4, $5, now(), false)
       ON CONFLICT (key) DO UPDATE SET
         label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
         source = EXCLUDED.source, movement_dir = EXCLUDED.movement_dir,
         movement_pct = EXCLUDED.movement_pct, updated_at = EXCLUDED.updated_at,
         is_stale = EXCLUDED.is_stale`,
      [row.label, row.value, row.unit, row.movementDir, row.movementPct],
    );

    await client.query('COMMIT');
    console.log(`\n[backfill-billet] committed. movement vs ~24h ago: ${movementDir} ${movementPct ?? 'n/a'}%`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[backfill-billet] rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
