/** G-159 follow-up: is the "don't remove the last admin" guard actually safe
 * against MULTIPLE CONCURRENT removals of DIFFERENT admins (not the same
 * row)? `allowlistCount()` used to be read outside any lock, before either
 * removal's own transaction — this probes whether that TOCTOU window is
 * real, and (per docs/audit-rbac-panel-G.md G-159's own "why not 100"
 * caveat) now scales past the original 2-connection reproduction to prove
 * `lockAdminRowsAndTarget`'s `SELECT ... FOR UPDATE` still serializes
 * correctly when many more transactions queue on the same locked row set.
 *
 * N is the number of admins seeded AND the number of concurrent removal
 * requests fired at once (one per admin) — defaults to 2 (the original
 * reproduction) but is meant to be run at 10-20 for the audit's "heavier
 * concurrency" ask. Whatever N is, EXACTLY ONE admin must survive: with the
 * lock, transactions serialize on the shared row set and each one after the
 * first re-reads a real (already-decremented) count, so N-1 succeed and the
 * last one blocks. Without the lock (pre-fix code), this degenerates to the
 * 2-connection case: many/most see the same stale count and the registry
 * can be zeroed out.
 *
 * Disposable LOCAL database only.
 *   TEST_DATABASE_URL=postgresql://.../iron_audit3 ADMIN_RACE_N=20 pnpm exec tsx scripts/lastAdminRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { allowlistCount, removeFromAllowlist, addToAllowlist } from '../src/lib/server/repos/adminAllowlistRepo';
import { BusinessRuleError } from '../src/lib/server/utils/businessOperation';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Requires a disposable localhost database');

// N concurrent removals need N real, simultaneously-open pg connections —
// otherwise node-postgres's own pool would queue requests ahead of ever
// reaching Postgres, and this would end up probing the pool's queue instead
// of the database's row lock. `max` comfortably exceeds N so every removal
// gets its own connection at once.
const N = Math.max(2, Number(process.env.ADMIN_RACE_N ?? 2));
const pool = new pg.Pool({ connectionString: url.toString(), max: N + 4 });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const mobiles = Array.from({ length: N }, (_, i) => `0912111${String(i + 1).padStart(4, '0')}`);

try {
  for (const mobile of mobiles) {
    await control.query(`INSERT INTO users(id,mobile,role) VALUES ($1,$2,'admin') ON CONFLICT (id) DO NOTHING`, [
      `admin-${mobile}`,
      mobile,
    ]);
    await addToAllowlist(mobile, `admin ${mobile}`, 'admin', `admin-${mobile}`);
  }
  const seededCount = await allowlistCount();
  console.log(`Seeded ${N} admins. allowlistCount() =`, seededCount);
  assert.equal(seededCount, N, `expected exactly ${N} admins seeded, got ${seededCount}`);

  // Go through the REAL repo function (lock-guarded), concurrently, for N
  // DIFFERENT admins at once — this is what the allowlist route actually
  // calls per request; firing N of them together is the real-world shape of
  // "several staff members clean up the admin list around the same time".
  async function removeIfNotLast(mobile: string): Promise<'removed' | 'blocked'> {
    try {
      await removeFromAllowlist(mobile);
      return 'removed';
    } catch (err) {
      if (err instanceof BusinessRuleError && err.code === 'last_admin') return 'blocked';
      throw err;
    }
  }

  const results = await Promise.all(mobiles.map(removeIfNotLast));
  const removedCount = results.filter((r) => r === 'removed').length;
  const blockedCount = results.filter((r) => r === 'blocked').length;
  const finalCount = await allowlistCount();
  console.log(`N=${N} removed=${removedCount} blocked=${blockedCount} finalAdminCount=${finalCount}`);

  if (finalCount === 0) {
    console.log(
      `REGRESSION CONFIRMED: ${N}-way concurrent removal of different admins zeroed out the allowlist — the last-admin guard has a real TOCTOU race.`,
    );
    process.exitCode = 1;
  } else {
    assert.equal(finalCount, 1, `expected EXACTLY 1 admin to remain (got ${finalCount}) — the lock should serialize down to precisely one survivor, not merely "at least one"`);
    assert.equal(blockedCount, 1, `expected exactly 1 of the ${N} concurrent removals to be blocked, got ${blockedCount}`);
    assert.equal(removedCount, N - 1, `expected ${N - 1} removals to succeed, got ${removedCount}`);
    console.log(`PASS: exactly 1 admin remains after ${N}-way concurrent removal (${removedCount} removed, ${blockedCount} blocked) — the FOR UPDATE lock serializes correctly under heavier concurrency, not just the original 2-connection case.`);
  }
} finally {
  await control.query(`DELETE FROM admin_allowlist WHERE mobile = ANY($1)`, [mobiles]).catch(() => {});
  await control.query(`DELETE FROM users WHERE mobile = ANY($1)`, [mobiles]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
