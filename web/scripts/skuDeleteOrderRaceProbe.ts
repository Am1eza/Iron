/** G-164: proves that deleting a SKU (bulk OR single-item) and a concurrent
 *  order creation for that SAME SKU, racing on two REAL, independent
 *  PostgreSQL connections, cannot both succeed — either the delete sees the
 *  (just-committed) open order and refuses (without override), or the order
 *  is rejected because the SKU it references has already, atomically,
 *  ceased to exist.
 *
 *  Before the fix, BOTH delete paths read "does this sku have an open
 *  order" and then deleted as two independent, unlocked queries — a
 *  concurrent `createOrder` landing between them committed an open order
 *  the delete never saw, and the sku was removed anyway (orderItems.skuId
 *  silently went to NULL via ON DELETE SET NULL — no crash, just a guard
 *  that did nothing under real concurrency). `deleteSkusBulkGuarded`/
 *  `deleteSkuGuarded`'s `FOR UPDATE` and `createOrder`'s `FOR SHARE` (all on
 *  the same sku rows) now serialize the two operations instead.
 *
 *  Run several iterations per path, not one — a single run can land the
 *  same way by chance depending on connection/scheduling timing, which
 *  would prove nothing about the OTHER interleaving.
 *
 *  Destructive fixtures only in a deliberately named, disposable LOCAL database.
 *  Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/skuDeleteOrderRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { ulid } from 'ulid';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { deleteSkuGuarded, deleteSkusBulkGuarded } from '../src/lib/server/repos/catalogAdminRepo';
import { createOrder } from '../src/lib/server/repos/ordersRepo';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) && /^\/iron_audit_/.test(url.pathname),
  'Requires a disposable localhost database named iron_audit_*',
);
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const catId = `cat-${ulid()}`;
const subId = `sub-${ulid()}`;
const N = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type DeleteOutcome = { blocked: boolean; removedCount: number };

/**
 * Both guarded functions take their lock as the FIRST statement in their
 * transaction; `createOrder` only reaches its `FOR SHARE` lock after
 * inserting the `orders` row (and, off the leadId path used here, a couple
 * of validation steps) — so a plain simultaneous start has the delete's
 * lock request reach Postgres first almost every time, which would only
 * ever exercise ONE of the two legitimate interleavings. Staggering the
 * start forces the other one on demand, so both get real coverage instead
 * of whichever one scheduling happens to favour.
 */
async function runOnce(
  label: string,
  i: number,
  stagger: 'deleteFirst' | 'orderFirst' | 'even',
  runDelete: (skuId: string) => Promise<DeleteOutcome>,
  outcomes: { deleteWon: number; orderWon: number },
) {
  const skuId = `sku-race-${label}-${i}-${ulid()}`;
  const ref = `OR-RACE-${label}-${i}-${ulid()}`;
  await control.query(
    `INSERT INTO skus(id, slug, name, size, category_id, sub_category_id, unit) VALUES ($1, $1, 'کالای آزمایشی', '14', $2, $3, 'kg')`,
    [skuId, catId, subId],
  );

  const delPromise = (async () => {
    if (stagger === 'orderFirst') await sleep(3);
    return runDelete(skuId);
  })();
  const orderPromise = (async () => {
    if (stagger === 'deleteFirst') await sleep(3);
    return createOrder({ ref, items: [{ skuId, name: 'کالای آزمایشی', qty: 1, unit: 'kg' }] });
  })();
  const [delSettled, orderSettled] = await Promise.allSettled([delPromise, orderPromise]);

  const skuStillExists = (await control.query('SELECT 1 FROM skus WHERE id=$1', [skuId])).rowCount! > 0;

  assert.equal(delSettled.status, 'fulfilled', `[${label}] delete must never throw, got: ${String((delSettled as PromiseRejectedResult).reason)}`);
  const delResult = (delSettled as PromiseFulfilledResult<DeleteOutcome>).value;

  if (orderSettled.status === 'fulfilled') {
    // The order won the race: it took the FOR SHARE lock first, so the
    // delete — once unblocked — re-read reality and saw the now-committed
    // open order. It must have been BLOCKED, not silently overridden, and
    // the sku must still exist.
    assert(delResult.blocked, `[${label}] order won the race but delete was not blocked — G-164 TOCTOU is back. delResult=${JSON.stringify(delResult)}`);
    assert(skuStillExists, `[${label}] order won the race and delete was blocked, so the SKU must still exist`);
    const orderRow = await control.query('SELECT id FROM orders WHERE ref=$1', [ref]);
    assert.equal(orderRow.rowCount, 1, `[${label}] the committed order must actually be in the table`);
    outcomes.orderWon++;
  } else {
    // The delete won the race: it took FOR UPDATE first, saw no open order
    // yet, and removed the sku. The order — unblocked only after that
    // commit — must have failed (FK violation on a sku that no longer
    // exists), not silently succeeded against a phantom row.
    assert(!delResult.blocked && delResult.removedCount === 1, `[${label}] delete won the race but did not report the sku removed. delResult=${JSON.stringify(delResult)}`);
    assert(!skuStillExists, `[${label}] delete won the race and reported success, so the sku must actually be gone`);
    const orderRow = await control.query('SELECT id FROM orders WHERE ref=$1', [ref]);
    assert.equal(orderRow.rowCount, 0, `[${label}] the order that lost the race must not have been committed at all`);
    outcomes.deleteWon++;
  }

  await control.query('DELETE FROM order_items WHERE sku_id=$1', [skuId]).catch(() => {});
  await control.query('DELETE FROM orders WHERE ref=$1', [ref]).catch(() => {});
  await control.query('DELETE FROM skus WHERE id=$1', [skuId]).catch(() => {});
}

async function runSuite(
  label: string,
  runDelete: (skuId: string) => Promise<DeleteOutcome>,
): Promise<{ deleteWon: number; orderWon: number }> {
  const outcomes = { deleteWon: 0, orderWon: 0 };
  const staggers = ['even', 'deleteFirst', 'orderFirst'] as const;
  for (let i = 0; i < N; i++) await runOnce(label, i, staggers[i % staggers.length]!, runDelete, outcomes);
  assert(outcomes.deleteWon > 0 && outcomes.orderWon > 0,
    `[${label}] expected both interleavings to actually occur across ${N} runs; got delete=${outcomes.deleteWon}, order=${outcomes.orderWon}`);
  return outcomes;
}

try {
  await control.query(`INSERT INTO categories(id, slug, name) VALUES ($1, $1, 'میلگرد')`, [catId]);
  await control.query(
    `INSERT INTO sub_categories(id, category_id, slug, name) VALUES ($1, $2, $1, 'آجدار')`,
    [subId, catId],
  );

  const bulk = await runSuite('bulk-delete', async (skuId) => {
    const r = await deleteSkusBulkGuarded([skuId], { override: false });
    return r.ok ? { blocked: false, removedCount: r.removed.length } : { blocked: true, removedCount: 0 };
  });
  console.log(`  ✓ deleteSkusBulkGuarded: delete won ${bulk.deleteWon}x, order won ${bulk.orderWon}x`);

  const single = await runSuite('single-delete', async (skuId) => {
    const r = await deleteSkuGuarded(skuId, { override: false });
    return r.status === 'removed' ? { blocked: false, removedCount: 1 } : { blocked: true, removedCount: 0 };
  });
  console.log(`  ✓ deleteSkuGuarded: delete won ${single.deleteWon}x, order won ${single.orderWon}x`);

  console.log(`PASS (${N * 2}/${N * 2}): both delete-sku paths serialize correctly against a concurrent order-creation `
    + 'on a shared SKU under real connection-level concurrency, in BOTH interleavings — the open-order guard cannot be raced around.');
} finally {
  await control.query('DELETE FROM sub_categories WHERE id=$1', [subId]).catch(() => {});
  await control.query('DELETE FROM categories WHERE id=$1', [catId]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
