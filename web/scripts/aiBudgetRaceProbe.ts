/** J-235/237: proves `reserveBudget()` admits EXACTLY the number of concurrent
 *  requests the daily cap allows — not more — under REAL, independent
 *  PostgreSQL connections (not PGlite, which has no real connection-level
 *  concurrency; see G-164's probes in this same directory for why that
 *  distinction is load-bearing).
 *
 *  Before this was provable: `budgetExhausted()` read a `SUM` cached 60s
 *  per-process with no lock — N concurrent requests could all read "under
 *  budget" and all proceed. `reserveBudget()` replaced that with a
 *  `pg_advisory_xact_lock`-guarded transaction (same shape as
 *  `claimOtpSend` in auth/store.pg.ts). This probe is the concurrency proof
 *  the audit itself demanded and that no unit test (all sequential
 *  `await`/`await`) actually provided.
 *
 *  Destructive fixtures only in a deliberately named, disposable LOCAL database.
 *  Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/aiBudgetRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { reserveBudget, releaseBudgetReservation, RESERVATION_CEILING_FOR_TESTS } from '../src/lib/server/ai/budget';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) && /^\/iron_audit_/.test(url.pathname),
  'Requires a disposable localhost database named iron_audit_*',
);
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const CEILING = RESERVATION_CEILING_FOR_TESTS;
const N = 20;

async function runOnce(concurrency: number, slots: number, label: string) {
  await control.query('DELETE FROM ai_usage');
  await control.query('DELETE FROM ai_budget_reservations');
  // Exactly `slots` reservation-ceilings of room today, no more.
  process.env.AI_DAILY_TOKEN_BUDGET = String(CEILING * slots);

  const results = await Promise.all(Array.from({ length: concurrency }, () => reserveBudget()));
  const admitted = results.filter((r) => r.ok);
  assert.equal(
    admitted.length,
    slots,
    `[${label}] expected exactly ${slots} of ${concurrency} concurrent reservations to be admitted, got ${admitted.length}`,
  );

  // Every admitted reservation must be genuinely distinct (no double-issue of
  // the same slot) and release cleanly.
  const ids = new Set(admitted.map((r) => (r.ok ? r.reservationId : '')));
  assert.equal(ids.size, admitted.length, `[${label}] admitted reservations must have distinct ids`);
  await Promise.all(admitted.map((r) => (r.ok ? releaseBudgetReservation(r.reservationId) : Promise.resolve())));

  console.log(`  ✓ ${label}: ${concurrency} concurrent requests, ${slots} slot(s) → exactly ${admitted.length} admitted`);
}

try {
  for (let i = 0; i < N; i++) {
    await runOnce(30, 1, `run ${i + 1}/${N} — one slot, 30-way race`);
  }
  // A second shape: several slots, still fewer than the concurrency, so the
  // lock has to serialize a real queue, not just a single winner-takes-all.
  await runOnce(25, 5, 'five slots, 25-way race');

  console.log(`PASS (${N + 1}/${N + 1}): reserveBudget() never admits more concurrent requests than the daily `
    + 'cap allows, under real connection-level concurrency — the TOCTOU the audit flagged (J-235/237) cannot occur.');
} finally {
  delete process.env.AI_DAILY_TOKEN_BUDGET;
  await control.query('DELETE FROM ai_usage').catch(() => {});
  await control.query('DELETE FROM ai_budget_reservations').catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
