/** E-114: proves businessOperation() — the idempotency-key mechanism behind
 * every warehouse movement, reservation, fulfillment, withdrawal and cash
 * entry (fulfillment.service.ts) — actually runs its side effect exactly
 * ONCE when the SAME operation id is submitted by two REAL, simultaneous
 * PostgreSQL connections (a network retry racing the still-in-flight
 * original request, not a retry after a clean response), not just on
 * sequential retries (already covered by operations.pg.test.ts's "retry is
 * exactly once" case, which never has two callers inside `run()` at once).
 *
 * Destructive fixtures only in a deliberately named, disposable LOCAL database.
 * Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/businessOperationRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { ulid } from 'ulid';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { businessOperation, BusinessRuleError } from '../src/lib/server/utils/businessOperation';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/iron_audit_e',
  'Requires a disposable localhost database named iron_audit_e');
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const opId = `probe-op-${ulid()}`;

try {
  let runs = 0;
  const HOLD_MS = 400;
  const run = async () => businessOperation(opId, { amount: 5 }, async () => {
    runs++;
    // Simulate real work (e.g. the warehouse-movement insert + billing
    // recompute in fulfillOrder) so the second caller's request genuinely
    // overlaps the first's still-open transaction, not just its network hop.
    await new Promise((r) => setTimeout(r, HOLD_MS));
    return { movementId: `mv-${runs}`, amount: 5 };
  });

  const start = Date.now();
  // Two REAL, independent connections submitting the identical operation id
  // and payload at the same instant.
  const [a, b] = await Promise.all([run(), run()]);
  const elapsed = Date.now() - start;

  assert.equal(runs, 1, `the side effect must execute exactly once, ran ${runs} times`);
  assert.deepEqual(a, b, 'both callers must receive the identical persisted result, not two different movement ids');
  assert.equal(a.movementId, 'mv-1', 'the result must be the FIRST run\'s, not a second, silently-different execution');
  // The loser must have BLOCKED behind the winner's still-open transaction
  // (real serialization on the business_operations PK), not raced ahead on a
  // stale read — if it had, total elapsed time would be close to HOLD_MS
  // instead of roughly 2x it (winner runs, commits, then loser's blocked
  // INSERT ... ON CONFLICT resolves and it reads the now-committed row).
  assert(elapsed >= HOLD_MS, `total elapsed (${elapsed}ms) is suspiciously short for two callers serialized through one ${HOLD_MS}ms side effect — the second may not have actually waited`);

  const rows = await control.query('SELECT count(*)::int AS n FROM business_operations WHERE id=$1', [opId]);
  assert.equal(rows.rows[0].n, 1, 'exactly one business_operations row must exist for this id');

  // A third call with the SAME id but a DIFFERENT payload must be rejected,
  // not silently replay the wrong result — proving the hash check survives
  // concurrent claiming too.
  await assert.rejects(
    businessOperation(opId, { amount: 999 }, async () => ({ movementId: 'should-not-run' })),
    (err: unknown) => err instanceof BusinessRuleError && err.code === 'operation_conflict',
  );

  console.log(`PASS: two real, simultaneous PostgreSQL connections submitting the same operation id executed the `
    + `side effect exactly once (serialized ${elapsed}ms for a ${HOLD_MS}ms operation) and both received the `
    + 'identical committed result; a same-id/different-payload replay was rejected as operation_conflict.');
} finally {
  await control.query('DELETE FROM business_operations WHERE id=$1', [opId]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
