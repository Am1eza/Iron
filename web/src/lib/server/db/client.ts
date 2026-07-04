/**
 * Postgres client. Two, deliberately different, lifetimes:
 *
 * - Node.js (Docker/local/tests): a real long-lived process, so a single
 *   `Pool` cached on globalThis (surviving dev HMR) is correct and cheap.
 * - Cloudflare Workers: a TCP socket "cannot be created in global scope and
 *   shared across requests" (Cloudflare's own words — an I/O object is tied
 *   to the request that created it). A module-level singleton Pool violates
 *   this: confirmed via local `wrangler dev` against a real Postgres that a
 *   cached Pool works on request 1, then *silently hangs* (not a thrown
 *   error) on request 2, alternating forever, until the Workers runtime's
 *   watchdog kills each hung request. So on Workers `getDb()` opens a fresh,
 *   small Pool per request instead, keyed off that request's own
 *   `ExecutionContext` (a fresh object per invocation) so the handful of
 *   repo calls within ONE request share it, and closes it via `after()`
 *   once the response has been sent.
 *
 * In builds without a resolvable connection string (mock mode), `hasDb()`
 * gates callers and `getDb()` throws a Persian-safe error the handlers turn
 * into a 503.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { after } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ahantimeDb?: { pool: Pool; db: Db } };

/** Per-request Pool cache for Workers — see the module doc comment above. */
const workersRequestDb = new WeakMap<object, { pool: Pool; db: Db }>();

/**
 * Explicit override, checked before the Cloudflare-context/Node.js
 * auto-detection below. Exists for callers that run OUTSIDE both a Next.js
 * request AND `next/server`'s `after()` (which itself requires an active
 * Next.js request lifecycle) — currently just the Cloudflare Cron Trigger
 * path (`jobs/cronRunner.ts`), which is a raw Workers `scheduled()`
 * invocation with no Next.js request to hang either mechanism off of. See
 * `runWithScopedDb`.
 */
const dbOverride = new AsyncLocalStorage<{ db: Db; pool: Pool | null }>();

/**
 * Run `fn` with `db`/`pool` as what `getDb()`/`getPool()`/`hasDb()` return,
 * regardless of runtime. The caller owns `pool`'s lifecycle (open before
 * calling this, close after it resolves) — this does not try to reuse the
 * Cloudflare-context-based per-request caching above, which depends on
 * `next/server`'s `after()` and doesn't apply outside a Next.js request.
 */
export function runWithScopedDb<T>(db: Db, pool: Pool | null, fn: () => Promise<T>): Promise<T> {
  return dbOverride.run({ db, pool }, fn);
}

/**
 * Resolves the live Postgres connection string. On Cloudflare Workers with a
 * Hyperdrive binding configured (wrangler.jsonc `hyperdrive` array, binding
 * name HYPERDRIVE — see DEPLOY-CLOUDFLARE.md), prefer it: Hyperdrive pools
 * and caches connections at Cloudflare's edge, which a Worker's own raw TCP
 * `pg` traffic cannot do on its own. Falls back to DATABASE_URL everywhere
 * else — Docker, local dev, Vitest, and Workers deploys without a
 * Hyperdrive binding (raw TCP via nodejs_compat still works, just without
 * edge-side pooling).
 */
function resolveConnectionString(cfEnv: Record<string, unknown> | undefined): string | undefined {
  const hyperdrive = cfEnv?.HYPERDRIVE as { connectionString?: string } | undefined;
  return hyperdrive?.connectionString ?? process.env.DATABASE_URL;
}

/**
 * `getCloudflareContext()` is synchronous outside SSG routes (this module is
 * only ever touched from route handlers and background jobs) and throws
 * when called without an active Workers request context — verified this is
 * a plain catchable Error, not a process crash, so Docker/tests fall
 * straight through to the Node.js path below with no special-casing needed.
 */
function tryGetCloudflareContext(): ReturnType<typeof getCloudflareContext> | null {
  try {
    return getCloudflareContext();
  } catch {
    return null;
  }
}

export function hasDb(): boolean {
  if (dbOverride.getStore()) return true;
  if (globalForDb.__ahantimeDb) return true;
  const cf = tryGetCloudflareContext();
  if (cf) return Boolean(resolveConnectionString(cf.env as unknown as Record<string, unknown>));
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Db {
  const scoped = dbOverride.getStore();
  if (scoped) return scoped.db;

  if (globalForDb.__ahantimeDb) return globalForDb.__ahantimeDb.db;

  const cf = tryGetCloudflareContext();
  if (cf) {
    const ctxKey = cf.ctx as object;
    const cached = workersRequestDb.get(ctxKey);
    if (cached) return cached.db;
    const url = resolveConnectionString(cf.env as unknown as Record<string, unknown>);
    if (!url) throw new Error('DATABASE_URL is not configured');
    // max: 5 — this Pool lives for one request only; it just needs enough
    // headroom for a handful of concurrent queries within that request; it
    // never needs to amortize connections across requests (Hyperdrive, when
    // bound, is what does that at the edge).
    const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 });
    const db = drizzle(pool, { schema });
    workersRequestDb.set(ctxKey, { pool, db });
    after(() => pool.end().catch(() => {}));
    return db;
  }

  // Node.js (Docker/local/tests): a real long-lived process.
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  // max: 15 — one container runs both web traffic and the job scheduler (up
  // to 6 jobs; each briefly holds a dedicated advisory-lock connection for
  // its run, see jobs/scheduler.ts), so a bit of headroom above the
  // previous 10 avoids pool contention between the two.
  const pool = new Pool({ connectionString: url, max: 15, connectionTimeoutMillis: 5000 });
  globalForDb.__ahantimeDb = { pool, db: drizzle(pool, { schema }) };
  return globalForDb.__ahantimeDb.db;
}

/**
 * The raw node-postgres pool, when a real one is backing `getDb()` (null
 * under pglite in tests, and on Workers — see the module doc comment).
 * Only needed for session-scoped advisory locks (`pg_advisory_lock`/
 * `unlock`), which must run on ONE dedicated connection for their whole
 * hold duration — `getDb()`'s pool-backed queries can land on any
 * connection, which is fine for ordinary queries but wrong for a lock you
 * intend to hold across other work (see jobs/scheduler.ts, which only ever
 * runs as its own long-lived Node.js process, never on Workers).
 */
export function getPool(): Pool | null {
  const scoped = dbOverride.getStore();
  if (scoped) return scoped.pool;
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
