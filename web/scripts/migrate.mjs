import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from './lib/migrations.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is required');
  process.exit(1);
}
const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
for (let attempt = 1; attempt <= 10; attempt++) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, application_name: 'ahantime-migrate' });
  try {
    await client.connect();
    await applyMigrations(client, folder, { checkOnly: process.env.MIGRATE_CHECK_ONLY === 'true' });
    console.log('[migrate] verified and applied');
    break;
  } catch (error) {
    if (!['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', '57P03'].includes(error.code) || attempt === 10) {
      console.error('[migrate] failed', { code: error.code, message: error.message });
      process.exitCode = 1;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  } finally { await client.end().catch(() => {}); }
}
