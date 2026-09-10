/**
 * F-131 — proves the OTP-send rate limit stays a GLOBAL quota across two
 * separate worker PROCESSES when Redis is unreachable, instead of silently
 * fragmenting into one independent quota per worker.
 *
 * ── The race this is designed around ────────────────────────────────────
 * `rateLimit()` (server/utils/rateLimit.ts) is Redis-backed on the Docker/Node
 * deploy — a shared counter every replica/worker sees. Redis being down used
 * to make it fall straight through to an in-process `Map`, which is PER
 * NODE PROCESS: two replicas each enforce their own "8 sends / 5 min", so an
 * attacker (or a bug) hammering the public IP limit through a load balancer
 * gets 8 × N-replicas sends instead of 8 total — worst exactly when an
 * outage makes abuse more likely. F-131's fix adds an atomic Postgres upsert
 * tier for the auth-critical scopes (`otp-request`, `otp-verify`) so the
 * quota stays global even without Redis.
 *
 * ── Why two real OS processes, not two `vi.mock` instances in one test ──
 * `rateLimit.ts`'s in-process fallback is a module-level `Map`, so two
 * "workers" in the SAME Node process would trivially share it — that would
 * prove nothing about the actual multi-replica scenario. This spawns
 * `rateLimitOutageWorker.ts` as two independent `tsx` child processes, each
 * with its own module registry (so its own, separate `windows` Map), both
 * pointed at the SAME real, disposable PostgreSQL via DATABASE_URL, with
 * REDIS_URL left unset in both (Redis "unreachable"). Both fire their
 * requests concurrently (`Promise.all` inside each worker, and the two
 * workers themselves started together, not sequentially).
 *
 * ── What's asserted ──────────────────────────────────────────────────────
 * For `otp-request` (limit 8, 6 concurrent attempts per worker = 12 total):
 * the COMBINED allowed count across both processes must be exactly the
 * configured limit (8), never 12 — proving the quota is global, not
 * per-process. As a control, the SAME experiment against `search` (a scope
 * deliberately NOT in DB_FALLBACK_SCOPES — see rateLimit.ts's comment on why)
 * is run too and is EXPECTED to fragment (combined allowed > its limit) —
 * this is the pre-existing, accepted degradation for non-auth-critical
 * scopes, included here so the probe demonstrates the fix is real (not just
 * "nothing is enforced anywhere any more") and scoped exactly where the audit
 * says it must be.
 *
 * Requires a disposable LOCAL database (destructive: truncates its own
 * scratch table). Apply migrations first, then:
 *   TEST_DATABASE_URL=postgresql://user@127.0.0.1:PORT/iron_audit_f2 \
 *     pnpm exec tsx scripts/rateLimitOutageProbe.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const execFileAsync = promisify(execFile);

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname),
  'Requires a disposable localhost database (set TEST_DATABASE_URL)',
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, 'rateLimitOutageWorker.ts');
const tsxBin = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');

async function runScenario(scope: string, limit: number, windowMs: number, attemptsPerWorker: number) {
  const dbUrl = url.toString();
  const spawnWorker = () =>
    execFileAsync(
      tsxBin,
      [workerPath, scope, String(limit), String(windowMs), String(attemptsPerWorker), dbUrl],
      // REDIS_URL intentionally absent from the child's env (Redis
      // "unreachable"); DISABLE_RATE_LIMIT_FOR_TESTS must stay unset or the
      // whole limiter short-circuits.
      { env: { ...process.env, REDIS_URL: '', DISABLE_RATE_LIMIT_FOR_TESTS: '' } },
    );

  // Started together via Promise.all, not one after another — a real outage
  // does not politely serialize two replicas' traffic either.
  const [a, b] = await Promise.all([spawnWorker(), spawnWorker()]);
  const parse = (r: { stdout: string }) => JSON.parse(r.stdout.trim().split('\n').pop()!) as {
    allowed: number;
    limited: number;
  };
  const wa = parse(a);
  const wb = parse(b);
  return { combinedAllowed: wa.allowed + wb.allowed, total: 2 * attemptsPerWorker, workers: [wa, wb] };
}

async function main() {
  const control = new pg.Client({ connectionString: url.toString() });
  await control.connect();
  try {
    // Fresh bucket every run — the fixed-window key is time-bucketed, but
    // clear defensively in case a previous crashed run left a row in the
    // SAME window (sub-second reruns).
    await control.query("DELETE FROM rate_limit_windows WHERE key LIKE 'otp-request:%' OR key LIKE 'search:%'");

    // ---- Scenario 1: otp-request — F-131's fix, expected to stay global ----
    const otpLimit = 8;
    const otp = await runScenario('otp-request', otpLimit, 5 * 60_000, 6);
    assert.equal(
      otp.combinedAllowed,
      otpLimit,
      `otp-request must stay a GLOBAL quota of ${otpLimit} across both workers during a Redis outage — ` +
        `got ${otp.combinedAllowed} combined allowed out of ${otp.total} attempted (workers: ${JSON.stringify(otp.workers)})`,
    );

    // ---- Scenario 2 (control): search — deliberately NOT DB-backed ----
    // Demonstrates the fix is scope-targeted, not a blanket change: this
    // scope is EXPECTED to fragment (each worker enforces its own window),
    // which is the accepted, documented trade-off for non-auth-critical
    // scopes (see rateLimit.ts's DB_FALLBACK_SCOPES comment).
    const searchLimit = 5;
    const search = await runScenario('search', searchLimit, 60_000, 6);
    assert(
      search.combinedAllowed > searchLimit,
      `control scenario expected 'search' to still fragment per-worker during a Redis outage ` +
        `(combined allowed ${search.combinedAllowed} should exceed its limit ${searchLimit}) — ` +
        `if this no longer fragments, DB_FALLBACK_SCOPES may have silently grown to include 'search'`,
    );

    console.log(
      `PASS: with Redis unreachable, two separate worker PROCESSES hammering the same IP saw a ` +
        `COMBINED otp-request quota of exactly ${otp.combinedAllowed}/${otpLimit} (not ${otp.total}) — the ` +
        `Postgres fallback keeps the OTP-send limit global. Control scope 'search' (not DB-backed by design) ` +
        `fragmented as expected: ${search.combinedAllowed} combined allowed against a limit of ${searchLimit}.`,
    );
  } finally {
    await control.query("DELETE FROM rate_limit_windows WHERE key LIKE 'otp-request:%' OR key LIKE 'search:%'").catch(() => {});
    await control.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
