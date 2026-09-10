/**
 * Staff access registry — the single list that decides who may enter the panel
 * and with which role (see schema/auth.ts `admin_allowlist`).
 *
 * The invariant this repo maintains: a user holds a STAFF role ⇔ their mobile
 * is in this table, with exactly the role the row names. Login syncs one
 * direction (promote/demote/re-role the user who just verified an OTP); the
 * add/update/remove mutations sync the other (the affected user is changed in
 * the same request, token version bumped so their live session dies at once).
 *
 * Membership is also what lets a number request a panel OTP at all — an
 * unlisted number never receives a panel login code (see auth/service.ts), so
 * strangers can neither reach the panel nor burn SMS credit probing it.
 */
import { eq, or } from 'drizzle-orm';
import { getDb, hasDb, type DbOrTx } from '@/lib/server/db/client';
import { adminAllowlist, users } from '@/lib/server/db/schema';
import { updateUser, userByMobile } from '@/lib/auth/store';
import { isStaff } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/server/utils/businessOperation';
import type { AuthUser, Role } from '@/lib/auth/types';

/** Roles that can be granted through the registry (never 'customer'). */
export type StaffRole = Exclude<Role, 'customer'>;

export interface AllowlistEntry {
  mobile: string;
  label: string | null;
  role: StaffRole;
  addedBy: string | null;
  createdAt: string;
  /** Live join: has this mobile ever logged in, and what role do they hold now? */
  userId: string | null;
  userName: string | null;
  userRole: string | null;
}

export async function listAllowlist(): Promise<AllowlistEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      mobile: adminAllowlist.mobile,
      label: adminAllowlist.label,
      role: adminAllowlist.role,
      addedBy: adminAllowlist.addedBy,
      createdAt: adminAllowlist.createdAt,
      userId: users.id,
      userName: users.name,
      userRole: users.role,
    })
    .from(adminAllowlist)
    .leftJoin(users, eq(users.mobile, adminAllowlist.mobile))
    .orderBy(adminAllowlist.createdAt);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** The granted role for a mobile, or null when it isn't staff at all. */
export async function allowlistedRole(mobile: string): Promise<StaffRole | null> {
  const rows = await getDb()
    .select({ role: adminAllowlist.role })
    .from(adminAllowlist)
    .where(eq(adminAllowlist.mobile, mobile))
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function isAllowlisted(mobile: string): Promise<boolean> {
  return (await allowlistedRole(mobile)) !== null;
}

/** How many entries hold the `admin` role — the last-admin guard reads this. */
export async function allowlistCount(): Promise<number> {
  const rows = await getDb()
    .select({ mobile: adminAllowlist.mobile })
    .from(adminAllowlist)
    .where(eq(adminAllowlist.role, 'admin'));
  return rows.length;
}

/**
 * G-159 follow-up (found this session): locks every current admin-role row
 * PLUS `mobile`'s own row (if it has one) in a single atomic read, so two
 * concurrent calls that each individually look safe ("2 admins, removing
 * one leaves 1") can never both proceed and leave zero. Without this, the
 * second transaction's plain `SELECT count(*)` reads the SAME pre-commit
 * snapshot as the first — reproduced directly with
 * scripts/lastAdminRaceProbe.ts (two concurrent removals of two DIFFERENT
 * admins zeroed the registry) before this fix existed. With it, the second
 * transaction's `FOR UPDATE` blocks on whichever row the first already
 * locked (the row set overlaps whenever both admins are still counted),
 * and only proceeds once the first has committed and the count is real.
 */
async function lockAdminRowsAndTarget(
  t: DbOrTx,
  mobile: string,
): Promise<{ adminCount: number; targetRole: StaffRole | null }> {
  const rows = await t
    .select({ mobile: adminAllowlist.mobile, role: adminAllowlist.role })
    .from(adminAllowlist)
    .where(or(eq(adminAllowlist.role, 'admin'), eq(adminAllowlist.mobile, mobile)))
    .for('update');
  return {
    adminCount: rows.filter((r) => r.role === 'admin').length,
    targetRole: rows.find((r) => r.mobile === mobile)?.role ?? null,
  };
}

/** Add or re-role a mobile; if that user already exists, apply it right away.
 *  The registry row and the user's role bump commit atomically — either both
 *  happen or neither does, so a mid-write failure can never leave the
 *  registry saying one role while the live user account still holds another
 *  (or vice versa). Runs in its own transaction unless the caller already has
 *  one open (`tx`), e.g. to include the audit row in the same commit.
 *  Throws BusinessRuleError('last_admin') if re-roling AWAY from admin would
 *  leave zero — checked under the lock above, not a separate unlocked read. */
export async function addToAllowlist(
  mobile: string,
  label: string | null,
  role: StaffRole,
  addedBy: string,
  tx?: DbOrTx,
): Promise<{ promotedUserId: string | null }> {
  const run = async (t: DbOrTx) => {
    if (role !== 'admin') {
      const { adminCount, targetRole } = await lockAdminRowsAndTarget(t, mobile);
      if (targetRole === 'admin' && adminCount <= 1) {
        throw new BusinessRuleError('last_admin', 'آخرین مدیر سیستم را نمی‌توان تنزل داد.', 409);
      }
    }
    await t
      .insert(adminAllowlist)
      .values({ mobile, label, role, addedBy })
      .onConflictDoUpdate({ target: adminAllowlist.mobile, set: { label, role, addedBy } });
    const existing = await userByMobile(mobile, t);
    if (existing && existing.role !== role) {
      await updateUser(existing.id, { role }, t); // bumps tokenVersion
      return { promotedUserId: existing.id };
    }
    return { promotedUserId: null };
  };
  return tx ? run(tx) : getDb().transaction(run);
}

/** Remove a mobile and strip its user's staff role (fail-closed) at once —
 *  same atomicity guarantee as `addToAllowlist`, and the same locked
 *  last-admin check (see `lockAdminRowsAndTarget`). Throws
 *  BusinessRuleError('last_admin') rather than silently no-op'ing so the
 *  route layer doesn't need its own (racy) pre-check anymore. */
export async function removeFromAllowlist(mobile: string, tx?: DbOrTx): Promise<{ demotedUserId: string | null }> {
  const run = async (t: DbOrTx) => {
    const { adminCount, targetRole } = await lockAdminRowsAndTarget(t, mobile);
    if (targetRole === 'admin' && adminCount <= 1) {
      throw new BusinessRuleError('last_admin', 'آخرین مدیر سیستم را نمی‌توان حذف کرد.', 409);
    }
    await t.delete(adminAllowlist).where(eq(adminAllowlist.mobile, mobile));
    const existing = await userByMobile(mobile, t);
    if (existing && isStaff(existing.role)) {
      await updateUser(existing.id, { role: 'customer' }, t); // bumps tokenVersion → live session dies
      return { demotedUserId: existing.id };
    }
    return { demotedUserId: null };
  };
  return tx ? run(tx) : getDb().transaction(run);
}

/**
 * Login-time sync (called from verifyOtp): the registry decides the staff
 * role, in BOTH directions — an unlisted staff account is demoted back to
 * `customer`, and a listed one is moved onto exactly the role its row names
 * (so changing a row's role takes effect on their next login even if their
 * session was never revoked). No-DB (mock/dev memory) mode is a no-op.
 * Best-effort by design — a sync failure must never block a customer login;
 * the permission gates still verify role+tokenVersion server-side.
 */
export async function syncAdminRoleOnLogin(user: AuthUser): Promise<AuthUser> {
  if (!hasDb()) return user;
  try {
    const granted = await allowlistedRole(user.mobile);
    if (granted && user.role !== granted) {
      return (await updateUser(user.id, { role: granted })) ?? user;
    }
    if (!granted && isStaff(user.role)) {
      return (await updateUser(user.id, { role: 'customer' })) ?? user;
    }
  } catch {
    /* fail open for CUSTOMER login, closed for staff: an un-synced staff
       member still passes gates only if their row really has that role. */
  }
  return user;
}

/** Seed/bootstrap: upsert env-declared admins (never removes anything). */
export async function bootstrapAllowlist(mobiles: string[]): Promise<number> {
  let n = 0;
  for (const mobile of mobiles) {
    await getDb()
      .insert(adminAllowlist)
      .values({ mobile, label: 'bootstrap (ADMIN_MOBILES)', role: 'admin', addedBy: null })
      .onConflictDoNothing();
    const existing = await userByMobile(mobile);
    if (existing && existing.role !== 'admin') await updateUser(existing.id, { role: 'admin' });
    n++;
  }
  return n;
}
