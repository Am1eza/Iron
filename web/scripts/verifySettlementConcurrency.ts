/** Destructive fixtures only in a deliberately named, disposable LOCAL database.
 * Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/verifySettlementConcurrency.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { voidSettlement, NotLatestSettlementError } from '../src/lib/server/repos/warehouseSettlementsRepo';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/iron_audit_e',
  'Requires a disposable localhost database named iron_audit_e');
const pool = new pg.Pool({ connectionString: url.toString(), application_name: 'iron-e-void-test' });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));
let pending: Promise<unknown> | undefined;
try {
  await control.query(`INSERT INTO users(id,mobile) VALUES ('e-race-owner','09129999883')`);
  await control.query(`INSERT INTO warehouse_items(id,ref,user_id,product,quantity_tons,status)
    VALUES ('e-race-item','WH-E-RACE','e-race-owner','test',5,'stored')`);
  await control.query(`INSERT INTO warehouse_settlements
    (id,warehouse_item_id,user_id,period_from,period_to,quantity_tons,monthly_fee_toman,amount_toman)
    VALUES ('e-race-first','e-race-item','e-race-owner',now()-interval '2 days',now()-interval '1 day',5,3000,500)`);
  await control.query('BEGIN');
  await control.query(`SELECT id FROM warehouse_items WHERE id='e-race-item' FOR UPDATE`);
  let finished = false;
  pending = voidSettlement('e-race-first', null).then(
    value => { finished = true; return value; },
    error => { finished = true; return error; },
  );
  let blocked = false;
  const deadline = Date.now() + 5000;
  while (!finished && Date.now() < deadline) {
    await control.query('SELECT pg_stat_clear_snapshot()');
    const state = await control.query(`SELECT 1 FROM pg_stat_activity
      WHERE application_name='iron-e-void-test' AND wait_event_type='Lock'`);
    if (state.rowCount) { blocked = true; break; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert(blocked, `Void must wait on the warehouse parent lock held by settlement creation; finished=${finished}`);
  await control.query(`INSERT INTO warehouse_settlements
    (id,warehouse_item_id,user_id,period_from,period_to,quantity_tons,monthly_fee_toman,amount_toman)
    SELECT 'e-race-second',warehouse_item_id,user_id,period_to,now(),5,3000,500
    FROM warehouse_settlements WHERE id='e-race-first'`);
  await control.query('COMMIT');
  assert((await pending) instanceof NotLatestSettlementError,
    'After waiting, void must observe the new settlement and reject an interior gap');
  const result = await control.query(`SELECT voided_at FROM warehouse_settlements WHERE id='e-race-first'`);
  assert.equal(result.rows[0].voided_at, null);
  console.log('PASS: real PostgreSQL parent lock blocks void; newer commit is observed; original remains active.');
} finally {
  await control.query('ROLLBACK');
  await pending;
  // The database is disposable; immutable accounting triggers intentionally
  // reject fixture cleanup by DELETE.
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
