/** F-146: proves the 5-active-session-family cap (`saveRefresh`,
 * store.pg.ts) holds under REAL concurrent logins on real PostgreSQL, not
 * just sequential `await`s — pglite is single-writer and cannot demonstrate
 * genuine row-lock contention across separate connections (see CLAUDE.md's
 * rule against pglite-only proof for concurrency claims).
 *
 * Scenario: a user already has exactly 5 active families. Two "6th logins"
 * (fresh, no parentHash) fire AT THE SAME TIME on two separate PostgreSQL
 * connections. `saveRefresh` takes `SELECT ... FOR UPDATE` on the user's own
 * row before reading/evicting/inserting, so PostgreSQL must serialize the two
 * transactions — the second one only starts its read after the first has
 * committed its eviction + insert. Proof that this is a real lock, not
 * a coincidence of timing: a manual control connection holds the SAME row
 * lock first and the two logins are both shown blocked on it.
 *
 * Expected result: exactly 5 families afterward (never 6), with BOTH new
 * logins present and the two ACTUAL oldest pre-existing families evicted —
 * not one login silently overwriting the other's eviction decision.
 *
 * Destructive fixtures only in a disposable LOCAL database. Apply migrations
 * first, then:
 *   TEST_DATABASE_URL=postgresql://user@127.0.0.1:PORT/iron_audit_f2 \
 *     pnpm exec tsx scripts/sessionFamilyCapRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { refreshTokens } from '../src/lib/server/db/schema';
import { pgStore } from '../src/lib/auth/store.pg';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname),
  'Requires a disposable localhost database (set TEST_DATABASE_URL)',
);

const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const mobile = '09120000946';
let pendingA: Promise<unknown> | undefined;
let pendingB: Promise<unknown> | undefined;

async function familyCount(userId: string): Promise<{ count: number; hashes: string[] }> {
  const db = drizzle(pool, { schema });
  const rows = await db
    .select({ tokenHash: refreshTokens.tokenHash, familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId));
  const families = new Set(rows.map((r) => r.familyId ?? r.tokenHash));
  return { count: families.size, hashes: rows.map((r) => r.tokenHash) };
}

try {
  const inserted = await control.query(
    `INSERT INTO users(id, mobile, name) VALUES ($1, $2, $3) RETURNING id`,
    ['race-user-f146', mobile, 'کاربر تست F-146'],
  );
  const userId = inserted.rows[0].id as string;

  const base = Date.now() + 3_600_000;
  for (let i = 1; i <= 5; i++) {
    await pgStore.saveRefresh(`f146-family-${i}`, { userId, expiresAt: base + i, familyId: `f146-family-${i}` });
  }
  const before = await familyCount(userId);
  assert.equal(before.count, 5, 'fixture must start with exactly 5 families');

  // Hold the exact row lock saveRefresh must also acquire (`SELECT ... FOR
  // UPDATE` on the user row), proving the two logins below genuinely queue
  // behind a real lock rather than just happening to interleave nicely.
  await control.query('BEGIN');
  const held = await control.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
  assert.equal(held.rowCount, 1, 'fixture user row must exist and be lockable');

  let aDone = false;
  let bDone = false;
  pendingA = pgStore
    .saveRefresh('f146-login-a', { userId, expiresAt: base + 9001, familyId: 'f146-login-a' })
    .then((v) => { aDone = true; return v; });
  pendingB = pgStore
    .saveRefresh('f146-login-b', { userId, expiresAt: base + 9002, familyId: 'f146-login-b' })
    .then((v) => { bDone = true; return v; });

  const HOLD_MS = 700;
  await new Promise((r) => setTimeout(r, HOLD_MS));
  assert.equal(aDone, false, 'login A must still be blocked on the user row lock — it resolved before the lock was released');
  assert.equal(bDone, false, 'login B must still be blocked on the user row lock — it resolved before the lock was released');

  await control.query('COMMIT');
  const deadline = Date.now() + 5000;
  while ((!aDone || !bDone) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(aDone && bDone, true, 'both concurrent logins must complete promptly once the row lock releases');
  await Promise.all([pendingA, pendingB]);

  const after = await familyCount(userId);
  assert.equal(
    after.count,
    5,
    `two simultaneous 6th logins must still land at exactly 5 families, not ${after.count} — got hashes: ${after.hashes.join(',')}`,
  );
  assert(after.hashes.includes('f146-login-a'), 'login A must have been admitted');
  assert(after.hashes.includes('f146-login-b'), 'login B must have been admitted');
  // The two oldest pre-existing families (smallest expiresAt: family-1, -2)
  // must be the ones evicted — not a random pair, and not the SAME one twice
  // (which would incorrectly leave 6 rows behind).
  assert(!after.hashes.includes('f146-family-1'), 'the oldest pre-existing family must have been evicted');
  assert(!after.hashes.includes('f146-family-2'), 'the second-oldest pre-existing family must ALSO have been evicted (two logins, two evictions)');
  for (let i = 3; i <= 5; i++) {
    assert(after.hashes.includes(`f146-family-${i}`), `family ${i} must have survived (only the two oldest are evicted)`);
  }

  console.log(
    'PASS: two concurrent 6th-login saveRefresh calls both blocked for the full ' +
      `${HOLD_MS}ms hold on the real row lock, then, once released, serialized correctly — ` +
      'final state is exactly 5 families (both new logins admitted, the two actual oldest evicted), never 6.',
  );
} finally {
  await control.query('ROLLBACK').catch(() => {});
  await Promise.all([pendingA?.catch(() => {}), pendingB?.catch(() => {})]);
  await control.query(`DELETE FROM refresh_tokens WHERE user_id = 'race-user-f146'`).catch(() => {});
  await control.query(`DELETE FROM users WHERE id = 'race-user-f146'`).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
