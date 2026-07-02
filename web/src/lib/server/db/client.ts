/**
 * Postgres client — lazy singleton so route handlers can import it freely.
 * Uses node-postgres; cached on globalThis to survive dev HMR. In builds
 * without DATABASE_URL (mock mode), `hasDb()` gates callers and `getDb()`
 * throws a Persian-safe error the handlers turn into a 503.
 */
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ahantimeDb?: { pool: Pool; db: Db } };

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL) || Boolean(globalForDb.__ahantimeDb);
}

export function getDb(): Db {
  if (globalForDb.__ahantimeDb) return globalForDb.__ahantimeDb.db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  if (!globalForDb.__ahantimeDb) {
    // max: 15 — one container runs both web traffic and the job scheduler
    // (up to 6 jobs; each briefly holds a dedicated advisory-lock connection
    // for its run, see jobs/scheduler.ts), so a bit of headroom above the
    // previous 10 avoids pool contention between the two.
    const pool = new Pool({ connectionString: url, max: 15, connectionTimeoutMillis: 5000 });
    globalForDb.__ahantimeDb = { pool, db: drizzle(pool, { schema }) };
  }
  return globalForDb.__ahantimeDb.db;
}

/**
 * The raw node-postgres pool, when a real one is backing `getDb()` (null
 * under pglite in tests). Only needed for session-scoped advisory locks
 * (`pg_advisory_lock`/`unlock`), which must run on ONE dedicated connection
 * for their whole hold duration — `getDb()`'s pool-backed queries can land
 * on any connection, which is fine for ordinary queries but wrong for a
 * lock you intend to hold across other work (see jobs/scheduler.ts).
 */
export function getPool(): Pool | null {
  return globalForDb.__ahantimeDb?.pool ?? null;
}

/** Test seam: point the singleton at an externally-created drizzle instance (pglite). */
export function setDbForTesting(db: Db | null): void {
  const outgoingPool = globalForDb.__ahantimeDb?.pool;
  if (outgoingPool) void outgoingPool.end().catch(() => {});
  if (db) {
    globalForDb.__ahantimeDb = { pool: null as unknown as Pool, db };
  } else {
    delete globalForDb.__ahantimeDb;
  }
}

export { schema };
