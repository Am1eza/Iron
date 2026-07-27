/**
 * Multi-process entrypoint for the Next.js standalone server.
 *
 * WHY: `node server.js` runs ONE Node process, and Node executes JS on a
 * single thread — so on this 4-vCPU host exactly one core ever served
 * requests. Measured with k6 against the real production image (500 VUs,
 * realistic homepage → /api/market → /prices/[category] journey): the
 * container pinned at ~100-108% CPU (i.e. one saturated core) while Postgres
 * sat at ~0% and memory never passed 230MB/2GB. Nothing was broken — 99.86%
 * of journeys succeeded — but the tail collapsed under event-loop
 * contention: homepage p99 hit 14.85s and worst case 34.3s. Classic
 * single-event-loop saturation, not a database or memory problem.
 *
 * Node's `cluster` module forks N workers that SHARE the same listening
 * socket (the primary accepts and distributes), so all cores serve requests
 * with no reverse-proxy or topology change.
 *
 * SAFETY REVIEW — what becomes per-worker once this is multi-process, and
 * why each is fine here (checked before enabling, not assumed):
 *   - Rate limiting: Redis-backed and authoritative on this deploy
 *     (`rateLimit.ts` → `redisRateCheck`), so limits stay global. The
 *     in-process Map is only a fallback for when Redis is absent.
 *   - Circuit breakers (`resilience.ts`): in-process, so now per-worker.
 *     Already documented there as best-effort/per-isolate; N workers means a
 *     tripped breaker protects one worker at a time instead of all. Strictly
 *     better than none, and it fails toward "make the call" not "block".
 *   - Middleware redirect cache: per-worker, so N DB reads per TTL window
 *     instead of one. Negligible (one tiny query per worker per 60s).
 *   - OTP delivery watchdog (`sms.ts` setTimeout): stays on the worker that
 *     handled the send — self-contained, no cross-worker coordination.
 *   - Background jobs: NOT affected. They run as their own process
 *     (`scripts/jobs.mjs`, started separately in docker-entrypoint.sh) and
 *     additionally take a Postgres advisory lock per run, so clustering the
 *     web server cannot double-run them.
 *
 * CONNECTION BUDGET: each worker builds its own pg Pool, so total
 * connections = WEB_CONCURRENCY × PG_POOL_MAX (+ the jobs process). Keep the
 * product comfortably under Postgres `max_connections` (100 here) — see the
 * values set in docker-compose.yml.
 *
 * WEB_CONCURRENCY=1 (or unset on a 1-core box) skips clustering entirely and
 * runs the server inline, byte-identical to the previous behavior.
 */
import cluster from 'node:cluster';
import os from 'node:os';

const cores = os.availableParallelism?.() ?? os.cpus().length;
// Default leaves a core's worth of headroom for Postgres/Redis/Caddy, which
// share this host — saturating all 4 with app workers starves them.
const desired = Number(process.env.WEB_CONCURRENCY) || Math.max(1, Math.min(cores - 1, 3));

if (!cluster.isPrimary || desired <= 1) {
  await import('./server.js');
} else {
  console.log(`[cluster] starting ${desired} workers (${cores} cores detected)`);

  for (let i = 0; i < desired; i++) cluster.fork();

  // Restart a worker that dies unexpectedly, but never fight a crash loop:
  // if workers keep dying immediately, let the container die so Docker's
  // restart policy (and the deploy health gate) sees a real failure instead
  // of a process that looks alive while serving nothing.
  let recentExits = 0;
  const EXIT_WINDOW_MS = 10_000;
  const MAX_EXITS_PER_WINDOW = 5;
  setInterval(() => {
    recentExits = 0;
  }, EXIT_WINDOW_MS).unref();

  let shuttingDown = false;
  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    recentExits += 1;
    console.error(`[cluster] worker ${worker.process.pid} exited (code=${code} signal=${signal})`);
    if (recentExits > MAX_EXITS_PER_WINDOW) {
      console.error('[cluster] workers are crash-looping — exiting so the container restarts');
      process.exit(1);
    }
    cluster.fork();
  });

  // Docker sends SIGTERM to PID 1 (this primary). Forward it so in-flight
  // requests finish instead of every worker being SIGKILLed at the timeout.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      shuttingDown = true;
      console.log(`[cluster] ${sig} received — shutting workers down`);
      for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(sig);
    });
  }
}
