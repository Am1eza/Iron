/** G-159 follow-up: is the "don't remove the last admin" guard actually safe
 * against two CONCURRENT removals of two DIFFERENT admins (not the same
 * row)? `allowlistCount()` is read outside any lock, before either removal's
 * own transaction — this probes whether that TOCTOU window is real.
 * Disposable LOCAL database only. TEST_DATABASE_URL=postgresql://.../iron_audit3 pnpm exec tsx scripts/lastAdminRaceProbe.ts
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
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));
try {
  await control.query(`INSERT INTO users(id,mobile,role) VALUES ('admin-a','09121110001','admin'),('admin-b','09121110002','admin')`);
  await addToAllowlist('09121110001', 'A', 'admin', 'admin-a');
  await addToAllowlist('09121110002', 'B', 'admin', 'admin-b');
  console.log('Seeded 2 admins. allowlistCount() =', await allowlistCount());

  // Go through the REAL repo function (now lock-guarded), concurrently, for
  // two DIFFERENT admins — this is what proxy.ts/the route actually calls.
  async function removeIfNotLast(mobile: string): Promise<'removed' | 'blocked'> {
    try {
      await removeFromAllowlist(mobile);
      return 'removed';
    } catch (err) {
      if (err instanceof BusinessRuleError && err.code === 'last_admin') return 'blocked';
      throw err;
    }
  }

  const [resA, resB] = await Promise.all([removeIfNotLast('09121110001'), removeIfNotLast('09121110002')]);
  const finalCount = await allowlistCount();
  console.log(`A=${resA} B=${resB} finalAdminCount=${finalCount}`);

  if (finalCount === 0) {
    console.log('REGRESSION CONFIRMED: concurrent removal of two different admins can zero out the allowlist — the last-admin guard has a real TOCTOU race.');
  } else {
    console.log('PASS: at least one admin remains after the concurrent race.');
  }
} finally {
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
