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

import * as schema from '@/lib/server/db/schema';
import { setDbForTesting, type Db } from '@/lib/server/db/client';

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
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
