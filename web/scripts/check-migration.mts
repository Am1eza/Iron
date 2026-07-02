// Dev check: apply committed migrations to an in-process pglite instance.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const client = new PGlite({ extensions: { pg_trgm } });
const db = drizzle(client);
await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
const tables = await client.query(
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
);
console.log('tables:', tables.rows.map((r) => (r as { tablename: string }).tablename).join(', '));
console.log('MIGRATION OK');
