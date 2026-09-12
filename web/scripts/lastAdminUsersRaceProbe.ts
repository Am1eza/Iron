/** G-159 follow-up, second call site: does PATCH /api/admin/users/[id]'s
 * last-admin guard survive MULTIPLE CONCURRENT deactivations of DIFFERENT
 * active admins? Mirrors that route's actual transaction shape (FOR UPDATE
 * on every active-admin row, inside the same tx as the write) — see
 * src/app/api/admin/users/[id]/route.ts's PATCH handler, lines around the
 * "G-159 follow-up" comment there.
 *
 * N is the number of active admins seeded AND the number of concurrent
 * deactivation requests fired at once — defaults to 2 (the original
 * reproduction) but, per docs/audit-rbac-panel-G.md G-159's own "why not
 * 100" caveat ("the FOR UPDATE mechanism was not checked under heavier
 * load — tens of concurrent attempts, not just two"), is meant to be run at
 * 10-20 for that heavier-concurrency proof. Whatever N is, EXACTLY ONE
 * active admin must survive.
 *
 * Disposable LOCAL database only.
 *   TEST_DATABASE_URL=postgresql://.../iron_audit3 ADMIN_RACE_N=20 pnpm exec tsx scripts/lastAdminUsersRaceProbe.ts
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

// N concurrent transactions need N real, simultaneously-open pg connections
// — otherwise node-postgres's own pool would queue requests ahead of ever
// reaching Postgres, and this would end up probing the pool's queue instead
// of the database's row lock.
const N = Math.max(2, Number(process.env.ADMIN_RACE_N ?? 2));
const pool = new pg.Pool({ connectionString: url.toString(), max: N + 4 });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const ids = Array.from({ length: N }, (_, i) => `u-admin-${i + 1}`);
const mobiles = Array.from({ length: N }, (_, i) => `0912111${String(i + 1).padStart(4, '0')}`);

try {
  for (let i = 0; i < N; i++) {
    await control.query(
      `INSERT INTO users(id,mobile,role,is_active) VALUES ($1,$2,'admin',true) ON CONFLICT (id) DO UPDATE SET role='admin', is_active=true`,
      [ids[i], mobiles[i]],
    );
  }
  console.log(`Seeded ${N} active admins.`);

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

  const results = await Promise.all(ids.map(deactivateIfNotLast));
  const deactivatedCount = results.filter((r) => r === 'deactivated').length;
  const blockedCount = results.filter((r) => r === 'blocked').length;
  const remaining = await control.query(
    `SELECT count(*)::int AS n FROM users WHERE role='admin' AND is_active=true AND id = ANY($1)`,
    [ids],
  );
  const finalActiveAdminCount = remaining.rows[0].n as number;
  console.log(`N=${N} deactivated=${deactivatedCount} blocked=${blockedCount} finalActiveAdminCount=${finalActiveAdminCount}`);

  if (finalActiveAdminCount === 0) {
    console.log(
      `REGRESSION CONFIRMED: ${N}-way concurrent deactivation of different admins zeroed out active admins.`,
    );
    process.exitCode = 1;
  } else {
    assert.equal(
      finalActiveAdminCount,
      1,
      `expected EXACTLY 1 active admin to remain (got ${finalActiveAdminCount}) — the lock should serialize down to precisely one survivor, not merely "at least one"`,
    );
    assert.equal(blockedCount, 1, `expected exactly 1 of the ${N} concurrent deactivations to be blocked, got ${blockedCount}`);
    assert.equal(deactivatedCount, N - 1, `expected ${N - 1} deactivations to succeed, got ${deactivatedCount}`);
    console.log(
      `PASS: exactly 1 active admin remains after ${N}-way concurrent deactivation (${deactivatedCount} deactivated, ${blockedCount} blocked) — the FOR UPDATE lock serializes correctly under heavier concurrency, not just the original 2-connection case.`,
    );
  }
} finally {
  await control.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]).catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
