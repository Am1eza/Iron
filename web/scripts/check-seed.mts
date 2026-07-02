// Dev check: migrate + seed against in-process pglite and print row counts.
process.env.DATABASE_URL = ''; // ensure app singleton isn't used
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { seedDatabase } from '../src/lib/server/db/seed';
import * as schema from '../src/lib/server/db/schema';

const client = new PGlite({ extensions: { pg_trgm } });
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
await seedDatabase(db as never, { historyDays: 10, log: (m) => console.log('[seed]', m) });
for (const t of ['users','categories','sub_categories','skus','current_prices','price_points','market_values','market_points','articles','settings']) {
  const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(t.padEnd(16), (r.rows[0] as {n:number}).n);
}
// idempotency: run again, counts must not grow
const before = (await client.query('SELECT count(*)::int AS n FROM price_points')).rows[0] as {n:number};
await seedDatabase(db as never, { historyDays: 10 });
const after = (await client.query('SELECT count(*)::int AS n FROM price_points')).rows[0] as {n:number};
console.log('idempotent:', before.n === after.n ? 'YES' : `NO (${before.n} -> ${after.n})`);
console.log('SEED OK');
