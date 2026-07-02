/**
 * CLI/container entry for the background job scheduler — see
 * src/lib/server/jobs/scheduler.ts. Runs as its OWN process (started
 * alongside the Next.js server by docker-entrypoint.sh), not imported from
 * instrumentation.ts: `pg`'s dependency tree pulls in Node built-ins
 * (fs/path/stream via pg-connection-string/pgpass) that Next.js 15's
 * webpack dev-mode bundler cannot resolve for the instrumentation
 * compilation unit specifically (vercel/next.js#73179 — `next build`/the
 * Cloudflare Workers build are unaffected; only `next dev` broke, but
 * completely — every route 500s). Confirmed `serverExternalPackages`
 * does NOT fix this: tried with 'pg', then also 'pg-connection-string' —
 * each just relocates the same "Module not found" error one dependency
 * deeper (pg-connection-string → pgpass → next one). Running the scheduler
 * as a plain script outside Next's build entirely sidesteps the bug rather
 * than working around it.
 */
import { hasDb } from '../src/lib/server/db/client';
import { startJobs } from '../src/lib/server/jobs/scheduler';
import { jobs } from '../src/lib/server/jobs';

if (!hasDb()) {
  console.log('[jobs] DATABASE_URL not set — nothing to run.');
  process.exit(0);
}

startJobs(jobs);
console.log(`[jobs] scheduler running (${jobs.length} jobs).`);

// The scheduler's timers are intentionally .unref()'d (so they never block
// a co-located process's own exit) — this process exists ONLY to run them,
// so hold the event loop open explicitly instead of letting it drain empty.
setInterval(() => {}, 1 << 30);
