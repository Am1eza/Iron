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
    const pool = new Pool({ connectionString: url, max: 10 });
    globalForDb.__ahantimeDb = { pool, db: drizzle(pool, { schema }) };
  }
  return globalForDb.__ahantimeDb.db;
}

/** Test seam: point the singleton at an externally-created drizzle instance (pglite). */
export function setDbForTesting(db: Db | null): void {
  if (db) {
    globalForDb.__ahantimeDb = { pool: null as unknown as Pool, db };
  } else {
    delete globalForDb.__ahantimeDb;
  }
}

export { schema };
