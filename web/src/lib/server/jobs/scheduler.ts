/**
 * In-process job scheduler — started once per server via instrumentation.ts.
 * Plain setInterval (single long-running container; no queue infra). Each
 * run takes a SESSION-scoped pg advisory lock (`pg_try_advisory_lock` /
 * `pg_advisory_unlock`) on ONE dedicated connection borrowed from the pool,
 * held only for "is another replica already running this job" — the job
 * body then runs OUTSIDE that lock/transaction, against the normal shared
 * pool. This deliberately does NOT wrap `job.run()` in a transaction:
 * several jobs do real network I/O (tgju fetch, Kavenegar SMS sends) and/or
 * their own multi-query work, and holding a transaction (and its connection)
 * open across that — the previous `pg_try_advisory_xact_lock` inside
 * `db.transaction()` did exactly this — risks pinning a connection
 * idle-in-transaction for seconds against a 10-connection pool shared with
 * live request traffic.
 */
import { getPool, hasDb } from '@/lib/server/db/client';
import { reportError } from '@/lib/errors/report';

export type Job = {
  name: string;
  everyMs: number;
  /** Delay before the first run (defaults to a small jitter). */
  initialDelayMs?: number;
  run: () => Promise<void>;
};

const timers: ReturnType<typeof setInterval>[] = [];
let started = false;

async function runExclusive(job: Job): Promise<void> {
  if (!hasDb()) return;
  const pool = getPool();
  if (!pool) {
    // No real pg pool (e.g. pglite in tests) — nothing to lock against;
    // run once, uncontended.
    try {
      await job.run();
    } catch (err) {
      reportError(err, { job: job.name });
    }
    return;
  }

  const client = await pool.connect();
  try {
    const lockKey = `job:${job.name}`;
    const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
      lockKey,
    ]);
    if (!rows[0]?.locked) return; // another replica is already running this job
    try {
      await job.run();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
    }
  } catch (err) {
    reportError(err, { job: job.name });
  } finally {
    client.release();
  }
}

/**
 * No SIGTERM drain: on container shutdown, an in-flight `job.run()` is cut
 * off mid-work rather than awaited to completion. Accepted, not fixed —
 * every job here is safe to interrupt and re-run: `savePrice`/alert-claim
 * use atomic UPDATE/advisory-lock guards, `marketPoll`/`staleness`/
 * `proformaExpire`/`cleanup` just recompute derived state from source rows,
 * and the advisory lock itself is released by `client.release()` returning
 * the connection to the pool (Postgres also drops session-scoped locks when
 * a session ends), so a killed replica never leaves a job permanently
 * wedged for the next one to pick up.
 */
export function startJobs(jobs: Job[]): void {
  if (started) return;
  started = true;
  for (const job of jobs) {
    const jitter = job.initialDelayMs ?? Math.floor(Math.random() * 5000) + 2000;
    const kickoff = setTimeout(() => {
      void runExclusive(job);
      const t = setInterval(() => void runExclusive(job), job.everyMs);
      if (typeof t.unref === 'function') t.unref();
      timers.push(t);
    }, jitter);
    if (typeof kickoff.unref === 'function') kickoff.unref();
  }
  console.info(`[jobs] scheduler started (${jobs.map((j) => j.name).join(', ')})`);
}

/** Test-only. */
export function stopJobs(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  started = false;
}
