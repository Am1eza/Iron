/** E-102/E-103: proves that two REAL, concurrent PostgreSQL connections both
 * converting the SAME lead to an order — the classic double-submit /
 * retry-after-timeout scenario — produce exactly ONE order row, not two.
 *
 * createOrder() takes `SELECT ... FOR UPDATE` on the lead row before checking
 * for an existing order, so the two transactions below serialize on that
 * lock: whichever commits first inserts the order and flips the lead to
 * 'won'; the other, once unblocked, re-reads (now sees the just-inserted
 * order) and returns THAT one instead of inserting a second — this probe
 * exists to prove that holds under real connection-level concurrency, not
 * just sequential calls (already covered by operations.pg.test.ts).
 * `orders_lead_uq` (a partial unique index on non-deleted leadId) is the
 * last-resort backstop if the in-transaction check were ever bypassed.
 *
 * Destructive fixtures only in a deliberately named, disposable LOCAL database.
 * Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/leadOrderRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { ulid } from 'ulid';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { createOrder } from '../src/lib/server/repos/ordersRepo';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/iron_audit_e',
  'Requires a disposable localhost database named iron_audit_e');
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const leadId = ulid();

try {
  await control.query(
    `INSERT INTO leads(id, ref, contact_mobile, status, source) VALUES ($1, $2, '09120000915', 'new', 'cart')`,
    [leadId, `LD-PROBE-${leadId}`],
  );

  const refA = `OR-PROBE-A-${ulid()}`;
  const refB = `OR-PROBE-B-${ulid()}`;
  // Two real, independent pool connections both racing to convert the SAME
  // lead — e.g. a doubled admin click, or a client retry that outran its
  // first (still-committing) request.
  const [a, b] = await Promise.all([
    createOrder({ ref: refA, leadId, items: [] }),
    createOrder({ ref: refB, leadId, items: [] }),
  ]);

  // Whichever ref actually won, the loser must NOT have created a second row
  // under its own ref — it must have returned the winner's.
  assert(a.ref === refA || a.ref === refB, 'the resolved order must carry one of the two submitted refs, not a third');
  assert.equal(a.ref, b.ref, `both concurrent conversions must resolve to the SAME order, got ${a.ref} and ${b.ref}`);

  const rows = await control.query('SELECT id, ref FROM orders WHERE lead_id=$1', [leadId]);
  assert.equal(rows.rowCount, 1, `expected exactly one order row for this lead, got ${rows.rowCount}`);

  const lead = await control.query('SELECT status FROM leads WHERE id=$1', [leadId]);
  assert.equal(lead.rows[0].status, 'won', "the lead must be flipped to 'won' exactly once, by whichever transaction actually inserted");

  console.log('PASS: two concurrent PostgreSQL connections converting the same lead to an order produced exactly '
    + 'one order row and one lead-status transition — no duplicate order under real connection-level concurrency.');
} finally {
  await control.query('DELETE FROM orders WHERE lead_id=$1', [leadId]).catch(() => {});
  await control.query('DELETE FROM leads WHERE id=$1', [leadId]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
