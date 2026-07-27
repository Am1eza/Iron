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
import { eq } from 'drizzle-orm';
import { getDb, hasDb } from '@/lib/server/db/client';
import { adminAllowlist, users } from '@/lib/server/db/schema';
import { updateUser, userByMobile } from '@/lib/auth/store';
import { isStaff } from '@/lib/auth/roles';
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

/** Add or re-role a mobile; if that user already exists, apply it right away. */
export async function addToAllowlist(
  mobile: string,
  label: string | null,
  role: StaffRole,
  addedBy: string,
): Promise<{ promotedUserId: string | null }> {
  await getDb()
    .insert(adminAllowlist)
    .values({ mobile, label, role, addedBy })
    .onConflictDoUpdate({ target: adminAllowlist.mobile, set: { label, role, addedBy } });
  const existing = await userByMobile(mobile);
  if (existing && existing.role !== role) {
    await updateUser(existing.id, { role }); // bumps tokenVersion
    return { promotedUserId: existing.id };
  }
  return { promotedUserId: null };
}

/** Remove a mobile and strip its user's staff role (fail-closed) at once. */
export async function removeFromAllowlist(mobile: string): Promise<{ demotedUserId: string | null }> {
  await getDb().delete(adminAllowlist).where(eq(adminAllowlist.mobile, mobile));
  const existing = await userByMobile(mobile);
  if (existing && isStaff(existing.role)) {
    await updateUser(existing.id, { role: 'customer' }); // bumps tokenVersion → live session dies
    return { demotedUserId: existing.id };
  }
  return { demotedUserId: null };
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
