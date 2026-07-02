/**
 * Programmatic migration runner — used by the Docker entrypoint and
 * `pnpm db:migrate`. Applies committed SQL files from ./drizzle.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set — skipping migrations.');
  process.exit(process.env.MIGRATE_OPTIONAL === 'true' ? 0 : 1);
}

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
const pool = new pg.Pool({ connectionString: url, max: 1 });

const MAX_TRIES = 10;
for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log('[migrate] migrations applied.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    const transient = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|starting up/i.test(String(err));
    if (transient && attempt < MAX_TRIES) {
      console.warn(`[migrate] db not ready (attempt ${attempt}/${MAX_TRIES}) — retrying in 2s…`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    console.error('[migrate] failed:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}
