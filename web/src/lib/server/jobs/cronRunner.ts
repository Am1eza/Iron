/**
 * Cloudflare Cron Trigger entrypoint — see `custom-worker.ts` and the
 * `triggers.crons` / `ratelimits` comments in `wrangler.jsonc`. The Workers
 * deploy has no long-lived process for `setInterval`-based scheduling
 * (that's `scripts/jobs.ts`, Docker-only), so a Cron Trigger fires this once
 * per configured schedule instead.
 *
 * DB access needs its own explicit Pool here rather than the usual
 * `getDb()` auto-detection: `getDb()`'s Workers branch is keyed off
 * `getCloudflareContext()`, which only resolves inside an actual Next.js
 * request (OpenNext's fetch handler sets it up before Next runs) — a raw
 * `scheduled()` invocation never goes through that, and its Workers branch
 * also calls `next/server`'s `after()`, which itself requires an active
 * Next.js request lifecycle. `runWithScopedDb` sidesteps both: it opens one
 * Pool for this invocation, threads it through an AsyncLocalStorage that
 * `getDb()`/`getPool()`/`hasDb()` check first, and this function closes it
 * when done — every job below still calls the exact same `getDb()` it
 * always does, unmodified.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/server/db/schema';
import { runWithScopedDb } from '@/lib/server/db/client';
import { runExclusive } from './scheduler';
import { marketPollJob } from './marketPoll.job';
import { stalenessJob } from './staleness.job';
import { proformaExpireJob } from './proformaExpire.job';
import { alertsJob } from './alerts.job';
import { publishArticlesJob } from './publishArticles.job';
import { cleanupJob } from './cleanup.job';

const EVERY_TEN_MINUTES = '*/10 * * * *';
const HOURLY = '0 * * * *';

const MINUTE_JOBS = [marketPollJob, alertsJob, publishArticlesJob];
const TEN_MINUTE_JOBS = [stalenessJob, proformaExpireJob];
const HOURLY_JOBS = [cleanupJob];

/** Same resolution order as `db/client.ts`'s Workers branch: prefer
 *  Hyperdrive (edge-pooled) over a raw `DATABASE_URL`. */
function resolveConnectionString(env: Record<string, unknown>): string | undefined {
  const hyperdrive = env.HYPERDRIVE as { connectionString?: string } | undefined;
  return hyperdrive?.connectionString ?? (env.DATABASE_URL as string | undefined) ?? process.env.DATABASE_URL;
}

export async function runScheduledJobs(cron: string, env: Record<string, unknown>): Promise<void> {
  const jobs = cron === HOURLY ? HOURLY_JOBS : cron === EVERY_TEN_MINUTES ? TEN_MINUTE_JOBS : MINUTE_JOBS;

  const url = resolveConnectionString(env);
  if (!url) return; // no DB configured (e.g. a preview deploy without secrets) — nothing to run

  const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 });
  try {
    await runWithScopedDb(drizzle(pool, { schema }), pool, async () => {
      await Promise.all(jobs.map((job) => runExclusive(job)));
    });
  } finally {
    await pool.end().catch(() => {});
  }
}
