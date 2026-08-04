/**
 * E2E database — an in-process pglite instance speaking the real Postgres
 * wire protocol over a local TCP socket, so Playwright can drive the app's
 * actual live-mode API routes (real `pg.Pool`/`DATABASE_URL`) with zero
 * Docker/external Postgres dependency. Migrated + seeded once at startup,
 * then serves until the process is killed (playwright.config.ts's
 * webServer manages the lifecycle). Not used by anything outside `pnpm
 * test:e2e` — production always uses a real Postgres via docker-compose.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as schema from '../src/lib/server/db/schema';
import { seedDatabase } from '../src/lib/server/db/seed';
import type { Db } from '../src/lib/server/db/client';

const PORT = Number(process.env.E2E_DB_PORT ?? 55432);
const HOST = '127.0.0.1';

async function main() {
  const client = new PGlite({ extensions: { pg_trgm } });
  const db = drizzle(client, { schema }) as unknown as Db;

  const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
  await migrate(db as never, { migrationsFolder });
  console.log('[e2e-db] migrations applied.');

  await seedDatabase(db, { log: (m) => console.log(`[e2e-db] ${m}`) });
  console.log('[e2e-db] seeded.');

  // The seeder gives the dev admin a `users` row with role `admin` but NO
  // `admin_allowlist` row — and adminAllowlistRepo's invariant is "a user
  // holds a staff role ⇔ their mobile is in this table", enforced in both
  // directions by `syncAdminRoleOnLogin`. So the seeded admin cannot even
  // request a panel OTP («این شماره اجازهٔ ورود به پنل را ندارد»), and would
  // be demoted to `customer` if it could. The content/sales fixtures each got
  // their grant when the RBAC suite needed one; the admin never did, because
  // no spec had used it — admin-pricing-catalog.spec.ts is the first, and
  // `admin` is the only role holding both pricing:write and catalog:write.
  //
  // Granted HERE rather than in seed.ts on purpose: this is a test-harness
  // concern, and seed.ts's dev branch is shared with local development.
  const adminMobile = process.env.DEV_ADMIN_MOBILE ?? '09120000000';
  await db
    .insert(schema.adminAllowlist)
    .values({ mobile: adminMobile, label: 'e2e admin fixture', role: 'admin' })
    .onConflictDoNothing();
  console.log(`[e2e-db] panel grant for ${adminMobile}.`);

  // maxConnections defaults to 1 (no real concurrency) — the app's own
  // pg.Pool opens several connections at once (e.g. the market ticker and
  // the page's own catalog query firing together), and with the default,
  // the second connection doesn't queue, it just drops the first with
  // "Connection terminated unexpectedly". pglite-socket's built-in
  // QueryQueueManager (concurrent connections stay open, queries serialize
  // safely underneath) is what actually needs enabling here.
  const server = new PGLiteSocketServer({ db: client, host: HOST, port: PORT, maxConnections: 20 });
  await server.start();
  console.log(`[e2e-db] ready on postgres://postgres@${HOST}:${PORT}/postgres`);
}

main().catch((err) => {
  console.error('[e2e-db] failed:', err);
  process.exit(1);
});
