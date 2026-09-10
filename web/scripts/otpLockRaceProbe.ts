/** F-130: proves lockAndClearOtp() retires the challenge and sets the resend
 * lockout as ONE atomic transaction, serialized against claimOtpSend() via the
 * same otp_rate_limits row lock — closing the window where a concurrent
 * resend could observe "not yet locked" between a separate clearOtp()+lock().
 *
 * Destructive fixtures only in a deliberately named, disposable LOCAL database.
 * Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/otpLockRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { pgStore } from '../src/lib/auth/store.pg';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/iron_audit_h',
  'Requires a disposable localhost database named iron_audit_h');
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const mobile = '09120000911';
let pending: Promise<unknown> | undefined;
try {
  await control.query(`INSERT INTO otp_codes(mobile,code_hash,expires_at,attempts)
    VALUES ($1,'deadbeef',$2,6)`, [mobile, Date.now() + 600_000]);
  await control.query(`INSERT INTO otp_rate_limits(mobile,sends) VALUES ($1,'[]'::jsonb)`, [mobile]);

  // Hold the exact row lockAndClearOtp must also acquire, for a fixed window.
  await control.query('BEGIN');
  const held = await control.query('SELECT mobile FROM otp_rate_limits WHERE mobile=$1 FOR UPDATE', [mobile]);
  assert.equal(held.rowCount, 1, 'fixture row must exist and be lockable');

  let finished = false;
  pending = pgStore.lockAndClearOtp(mobile, Date.now() + 15 * 60_000).then(
    (v) => { finished = true; return v; },
    (e) => { finished = true; throw e; },
  );

  const HOLD_MS = 900;
  await new Promise((r) => setTimeout(r, HOLD_MS));
  assert.equal(finished, false,
    'lockAndClearOtp must still be blocked on the row lock claimOtpSend also takes — it resolved before the lock was released');

  // While still blocked, a concurrent resend racing on the same row must also
  // queue rather than slip through and see a pre-lock state.
  let resendSettled = false;
  const resend = pgStore.claimOtpSend(mobile, Date.now(), 30_000, 3_600_000, 5).then(
    (v) => { resendSettled = true; return v; },
  );
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(resendSettled, false, 'A concurrent resend must not resolve before the lock transaction commits');

  await control.query('COMMIT');
  const settleDeadline = Date.now() + 5000;
  while (!finished && Date.now() < settleDeadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(finished, true, 'lockAndClearOtp must complete promptly once the row lock is released');
  await pending;

  const resendResult = await resend;
  assert.equal(resendResult.ok, false, 'The resend must observe the lock that just committed, not a pre-lock state');
  assert.equal((resendResult as { reason: string }).reason, 'locked');

  const otpRow = await control.query('SELECT 1 FROM otp_codes WHERE mobile=$1', [mobile]);
  assert.equal(otpRow.rowCount, 0, 'The exhausted challenge must be gone once the lock is visible');
  const rateRow = await control.query('SELECT locked_until FROM otp_rate_limits WHERE mobile=$1', [mobile]);
  assert(Number(rateRow.rows[0].locked_until) > Date.now(), 'lockedUntil must be set in the same commit');

  console.log(`PASS: lockAndClearOtp blocked for the full ${HOLD_MS}ms hold, then completed atomically once the row lock`
    + ' released; a concurrent resend queued behind it and correctly observed the lock, not a pre-lock state.');
} finally {
  await control.query('ROLLBACK').catch(() => {});
  await pending?.catch(() => {});
  await control.query('DELETE FROM otp_codes WHERE mobile=$1', [mobile]).catch(() => {});
  await control.query('DELETE FROM otp_rate_limits WHERE mobile=$1', [mobile]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
