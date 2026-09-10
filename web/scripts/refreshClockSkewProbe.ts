/** F-145: proves the refresh-token rotation/reuse decision (claimed/grace/
 * reuse) and the new token's expiry are computed from the DATABASE's clock,
 * not the calling Node worker's `Date.now()` — closing the gap where two
 * app-server processes disagreeing about the time (ordinary NTP drift,
 * container pause, VM steal time — not a hypothetical) could turn a
 * legitimate multi-tab retry inside the grace window into a false "reuse"
 * detection (killing a real user's whole session family), or vice versa.
 *
 * Method: adversarially lie to THIS process's clock (mock `Date.now`) between
 * the first rotation (which claims the parent token) and the second
 * (which must land in the grace window) — a lie far larger than any grace
 * window. Before the fix, `rotateRefreshAtomic` was handed that lied-about
 * `now` directly and used it for both the age computation and the child's
 * expiry, so this exact scenario would have misclassified the grace-window
 * retry as reuse (or corrupted the new token's lifetime). After the fix, the
 * store re-reads Postgres's own `clock_timestamp()` inside the transaction
 * and ignores what the caller's process clock claims — so the outcome must
 * still be 'grace', and the persisted expiry must track real elapsed time,
 * not the lie.
 *
 * Destructive fixtures only in a deliberately named, disposable LOCAL database.
 * Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/refreshClockSkewProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { pgStore } from '../src/lib/auth/store.pg';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/iron_audit_e',
  'Requires a disposable localhost database named iron_audit_e');
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const realDateNow = Date.now.bind(Date);
const userId = '01HZQPROBEUSERCLOCKSKEW0001';
const parentHash = 'probe-parent-hash-clock-skew';
const childHash1 = 'probe-child-1-clock-skew';
const childHash2 = 'probe-child-2-clock-skew';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // SESSION_TTL_DAYS-shaped
const GRACE_MS = 60_000; // REFRESH_REUSE_GRACE default shape

async function dbNow(): Promise<number> {
  const r = await control.query('select round(extract(epoch from clock_timestamp()) * 1000) as ms');
  return Number(r.rows[0].ms);
}

try {
  await control.query(`INSERT INTO users(id, mobile, role) VALUES ($1, '09120000912', 'customer')
    ON CONFLICT (id) DO NOTHING`, [userId]);
  const t0 = await dbNow();
  await control.query(
    `INSERT INTO refresh_tokens(token_hash, user_id, expires_at, family_id) VALUES ($1, $2, $3, $1)`,
    [parentHash, userId, t0 + TTL_MS],
  );

  // First rotation: claims the parent for real, using the store's own
  // (already-fixed) DB-time source. No skew involved yet — this just seeds
  // `rotated_at`.
  const claimed = await pgStore.rotateRefreshAtomic(parentHash, childHash1, TTL_MS, GRACE_MS, false);
  assert.equal(claimed.status, 'claimed', `expected 'claimed', got ${claimed.status}`);
  assert('childExpiresAt' in claimed, 'claimed result must carry childExpiresAt');
  const afterClaim = await dbNow();
  assert(Math.abs(claimed.childExpiresAt - (afterClaim + TTL_MS)) < 5000,
    `childExpiresAt (${claimed.childExpiresAt}) must track the DB clock + TTL (~${afterClaim + TTL_MS}), not drift by more than a few seconds`);

  // Now lie to THIS process's clock by +10 hours — far larger than any grace
  // window, and in the direction that would make a skewed "age" computation
  // look like ancient, expired reuse rather than a fresh grace-window retry.
  const LIE_MS = 10 * 60 * 60 * 1000;
  const fakeNow = realDateNow() + LIE_MS;
  Date.now = () => fakeNow;
  let grace: Awaited<ReturnType<typeof pgStore.rotateRefreshAtomic>>;
  try {
    // Real elapsed wall-clock time since the claim above is a few
    // milliseconds — well inside GRACE_MS — despite this process's `Date.now`
    // insisting 10 hours have passed.
    grace = await pgStore.rotateRefreshAtomic(parentHash, childHash2, TTL_MS, GRACE_MS, false);
  } finally {
    Date.now = realDateNow;
  }
  assert.equal(grace.status, 'grace',
    `expected 'grace' (real elapsed time is milliseconds) but got '${grace.status}' — the rotation decision followed this process's LIED-about clock instead of the database's`);
  assert('childExpiresAt' in grace, 'grace result must carry childExpiresAt');
  const afterGrace = await dbNow();
  assert(Math.abs(grace.childExpiresAt - (afterGrace + TTL_MS)) < 5000,
    `childExpiresAt (${grace.childExpiresAt}) must track the REAL database clock + TTL (~${afterGrace + TTL_MS}), not the lied-about Node clock (would be off by ~${LIE_MS}ms)`);
  // The decisive check: had the lied-about clock leaked in, childExpiresAt
  // would be ~LIE_MS larger than real-DB-now + TTL. Confirm it is nowhere
  // near that wrong value.
  assert(Math.abs(grace.childExpiresAt - (fakeNow + TTL_MS)) > LIE_MS / 2,
    'childExpiresAt landed near fakeNow+TTL — the lied-about Node clock leaked into the persisted expiry');

  console.log('PASS: rotateRefreshAtomic\'s claimed/grace decision and the new token\'s expiry both tracked the '
    + "database's real clock through a +10h lie to this process's Date.now — F-145's cross-worker clock-skew "
    + 'path is closed for the refresh rotation/reuse decision.');
} finally {
  Date.now = realDateNow;
  await control.query('DELETE FROM refresh_tokens WHERE family_id = $1', [parentHash]).catch(() => {});
  await control.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
