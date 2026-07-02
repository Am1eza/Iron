/**
 * CLI/container entry for the database seeder — see src/lib/server/db/seed.ts.
 * Run: pnpm db:seed   (FORCE_RESEED=true to redo catalog rows)
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from '../src/lib/server/db/schema';
import { seedDatabase } from '../src/lib/server/db/seed';
import type { Db } from '../src/lib/server/db/client';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[seed] DATABASE_URL is not set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema }) as unknown as Db;
  await seedDatabase(db, {
    force: process.env.FORCE_RESEED === 'true',
    log: (m) => console.log(`[seed] ${m}`),
  });
  await pool.end();
  console.log('[seed] done.');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
