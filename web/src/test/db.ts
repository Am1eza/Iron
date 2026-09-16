/**
 * Test DB helper — in-process Postgres (pglite) with migrations applied.
 * Wire it into the app's lazy singleton via `setDbForTesting` so repos and
 * route handlers under test hit the ephemeral instance.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';

import * as schema from '@/lib/server/db/schema';
import { setDbForTesting, type Db } from '@/lib/server/db/client';

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  if (process.env.TEST_DATABASE_URL) {
    // This URL belongs to an isolated test cluster with CREATEDB permission.
    // Never migrate/drop the database supplied in the URL itself.
    const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    const name = `audit_k_test_${randomUUID().replaceAll('-', '')}`;
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 10 });
    const db = pgDrizzle(pool, { schema });
    try {
      await pgMigrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    } catch (error) {
      await pool.end();
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end();
      throw error;
    }
    setDbForTesting(db);
    return { db, close: async () => {
      setDbForTesting(null);
      await pool.end();
      try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
      finally { await admin.end(); }
    } };
  }
  const client = new PGlite({ extensions: { pg_trgm } });
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  setDbForTesting(db);
  return {
    db,
    close: async () => {
      setDbForTesting(null);
      await client.close();
    },
  };
}
