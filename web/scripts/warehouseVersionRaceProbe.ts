/** E-110: proves updateWarehouseItem's optimistic-concurrency guard
 * (`expectedVersion` + `SELECT ... FOR UPDATE`) actually prevents the lost
 * update the audit describes: two operators both looking at the SAME
 * on-screen quantity (10 tons) each submit an absolute target of 7 tons —
 * intending two SEPARATE 3-ton withdrawals — over two REAL, concurrent
 * PostgreSQL connections. Without the version check, Postgres's row lock
 * would still serialize the two UPDATEs, but the second writer would
 * silently overwrite with the same stale target (7), collapsing two real
 * physical withdrawals into one recorded reduction. With it, only the
 * request that actually observed the current version may proceed; the other
 * is rejected with `stale_version`, forcing the operator to re-read and
 * resubmit against the real remaining quantity — never silently dropped.
 *
 * Destructive fixtures only in a deliberately named, disposable LOCAL database.
 * Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/warehouseVersionRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { ulid } from 'ulid';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { createWarehouseItem, updateWarehouseItem } from '../src/lib/server/repos/ordersRepo';
import { BusinessRuleError } from '../src/lib/server/utils/businessOperation';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/iron_audit_e',
  'Requires a disposable localhost database named iron_audit_e');
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const actorId = '01HZQPROBEUSERWHVERSION0001';

try {
  await control.query(`INSERT INTO users(id, mobile, role) VALUES ($1, '09120000913', 'admin')
    ON CONFLICT (id) DO NOTHING`, [actorId]);
  const ownerId = '01HZQPROBEUSERWHVERSION0002';
  await control.query(`INSERT INTO users(id, mobile, role) VALUES ($1, '09120000914', 'customer')
    ON CONFLICT (id) DO NOTHING`, [ownerId]);

  const item = await createWarehouseItem({
    ref: `WH-PROBE-${ulid()}`, userId: ownerId, product: 'میلگرد', quantityTons: 10,
    monthlyFeeToman: 60_000, actorId,
  });
  const stored = await updateWarehouseItem(item.id, { status: 'stored' }, actorId, 'رسید ورود فیزیکی');
  assert(stored, 'setup: moving to stored must succeed');
  const baseVersion = stored!.after.version;

  // Two REAL, independent connections (from the pool) racing the exact same
  // stale expectedVersion — the scenario of two operators both loading the
  // item page before either one saves.
  const results = await Promise.allSettled([
    updateWarehouseItem(item.id, { quantityTons: 7 }, actorId, 'خروج آزمایشی اول', { expectedVersion: baseVersion }),
    updateWarehouseItem(item.id, { quantityTons: 7 }, actorId, 'خروج آزمایشی دوم', { expectedVersion: baseVersion }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, `expected exactly one winner, got ${fulfilled.length} (of 2)`);
  assert.equal(rejected.length, 1, `expected exactly one loser, got ${rejected.length} (of 2)`);
  const loserReason = (rejected[0] as PromiseRejectedResult).reason;
  assert(loserReason instanceof BusinessRuleError && loserReason.code === 'stale_version',
    `the loser must be rejected as stale_version, got: ${String(loserReason)}`);

  const after = await control.query('SELECT quantity_tons, version FROM warehouse_items WHERE id=$1', [item.id]);
  assert.equal(Number(after.rows[0].quantity_tons), 7, 'exactly one reduction must have applied — not zero, not double-applied to a wrong value');
  assert.equal(Number(after.rows[0].version), baseVersion + 1, 'version must have advanced by exactly one, not two — the second writer never committed');

  const movements = await control.query(
    `SELECT count(*)::int AS n FROM warehouse_movements WHERE warehouse_item_id=$1 AND kind='release'`,
    [item.id],
  );
  assert.equal(movements.rows[0].n, 1, 'exactly one release movement must be recorded — the rejected request left no ledger trace');

  console.log('PASS: two concurrent PostgreSQL connections racing the same stale expectedVersion on a warehouse '
    + "item produced exactly one winner (quantity 10→7, version advanced by one, one ledger movement) and one "
    + "'stale_version' rejection with zero side effects — no lost update, no phantom withdrawal.");
} finally {
  await control.query(`DELETE FROM warehouse_movements WHERE actor_id IN ($1)`, [actorId]).catch(() => {});
  await control.query(`DELETE FROM warehouse_items WHERE received_by = $1`, [actorId]).catch(() => {});
  await control.query(`DELETE FROM users WHERE id IN ($1, '01HZQPROBEUSERWHVERSION0002')`, [actorId]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
