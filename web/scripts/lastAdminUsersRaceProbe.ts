/** G-159 follow-up, second call site: does PATCH /api/admin/users/[id]'s
 * last-admin guard survive two CONCURRENT deactivations of two DIFFERENT
 * active admins? Mirrors that route's actual transaction shape (FOR UPDATE
 * on every active-admin row, inside the same tx as the write).
 * Disposable LOCAL database only. TEST_DATABASE_URL=postgresql://.../iron_audit3 pnpm exec tsx scripts/lastAdminUsersRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting, getDb } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { updateUser } from '../src/lib/auth/store';
import { BusinessRuleError } from '../src/lib/server/utils/businessOperation';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Requires a disposable localhost database');
const pool = new pg.Pool({ connectionString: url.toString() });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));
try {
  await control.query(`INSERT INTO users(id,mobile,role,is_active) VALUES ('u-admin-a','09121110011','admin',true),('u-admin-b','09121110012','admin',true)`);
  console.log('Seeded 2 active admins.');

  async function deactivateIfNotLast(id: string): Promise<'deactivated' | 'blocked'> {
    try {
      await getDb().transaction(async (tx) => {
        const activeAdmins = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(and(eq(schema.users.role, 'admin'), eq(schema.users.isActive, true)))
          .for('update');
        if (activeAdmins.length <= 1) throw new BusinessRuleError('last_admin', 'blocked', 409);
        await updateUser(id, { isActive: false }, tx);
      });
      return 'deactivated';
    } catch (err) {
      if (err instanceof BusinessRuleError && err.code === 'last_admin') return 'blocked';
      throw err;
    }
  }

  const [resA, resB] = await Promise.all([deactivateIfNotLast('u-admin-a'), deactivateIfNotLast('u-admin-b')]);
  const remaining = await control.query(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND is_active=true`);
  console.log(`A=${resA} B=${resB} finalActiveAdminCount=${remaining.rows[0].n}`);

  if (remaining.rows[0].n === 0) {
    console.log('REGRESSION: concurrent deactivation of two different admins zeroed out active admins.');
  } else {
    console.log('PASS: at least one active admin remains after the concurrent race.');
  }
} finally {
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
