/**
 * In-process job scheduler — started once per server via instrumentation.ts.
 * Plain setInterval (single long-running container; no queue infra). Each run
 * takes a pg transaction-scoped advisory lock so scaling to multiple app
 * replicas never double-runs a job.
 */
import { sql } from 'drizzle-orm';
import { getDb, hasDb } from '@/lib/server/db/client';
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
  try {
    const db = getDb();
    await db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtext(${'job:' + job.name})) AS locked`,
      );
      const locked = (rows as unknown as { rows?: { locked: boolean }[] }).rows?.[0]?.locked
        ?? (rows as unknown as { locked: boolean }[])[0]?.locked;
      if (!locked) return; // another replica is running this job
      await job.run();
    });
  } catch (err) {
    reportError(err, { job: job.name });
  }
}

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
