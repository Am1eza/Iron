/**
 * Admin allowlist — who may hold the `admin` role (see schema/auth.ts).
 *
 * The invariant this repo maintains: `users.role = 'admin'` ⇔ the mobile is
 * on the allowlist. Login syncs one direction (promote/demote the user who
 * just verified an OTP); the add/remove mutations sync the other (a removed
 * mobile's user is demoted in the same request, token version bumped so
 * their live session dies immediately).
 */
import { eq } from 'drizzle-orm';
import { getDb, hasDb } from '@/lib/server/db/client';
import { adminAllowlist, users } from '@/lib/server/db/schema';
import { updateUser, userByMobile } from '@/lib/auth/store';
import type { AuthUser } from '@/lib/auth/types';

export interface AllowlistEntry {
  mobile: string;
  label: string | null;
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

export async function isAllowlisted(mobile: string): Promise<boolean> {
  const rows = await getDb()
    .select({ mobile: adminAllowlist.mobile })
    .from(adminAllowlist)
    .where(eq(adminAllowlist.mobile, mobile))
    .limit(1);
  return rows.length > 0;
}

export async function allowlistCount(): Promise<number> {
  const rows = await getDb().select({ mobile: adminAllowlist.mobile }).from(adminAllowlist);
  return rows.length;
}

/** Add a mobile; if that user already exists, promote them right away. */
export async function addToAllowlist(
  mobile: string,
  label: string | null,
  addedBy: string,
): Promise<{ promotedUserId: string | null }> {
  await getDb()
    .insert(adminAllowlist)
    .values({ mobile, label, addedBy })
    .onConflictDoUpdate({ target: adminAllowlist.mobile, set: { label, addedBy } });
  const existing = await userByMobile(mobile);
  if (existing && existing.role !== 'admin') {
    await updateUser(existing.id, { role: 'admin' }); // bumps tokenVersion
    return { promotedUserId: existing.id };
  }
  return { promotedUserId: null };
}

/** Remove a mobile and demote its user (fail-closed) in the same request. */
export async function removeFromAllowlist(mobile: string): Promise<{ demotedUserId: string | null }> {
  await getDb().delete(adminAllowlist).where(eq(adminAllowlist.mobile, mobile));
  const existing = await userByMobile(mobile);
  if (existing && existing.role === 'admin') {
    await updateUser(existing.id, { role: 'customer' }); // bumps tokenVersion → live session dies
    return { demotedUserId: existing.id };
  }
  return { demotedUserId: null };
}

/**
 * Login-time sync (called from verifyOtp): the allowlist decides the admin
 * role, in BOTH directions. No-DB (mock/dev memory) mode is a no-op.
 * Best-effort by design — a sync failure must never block a customer login;
 * the permission gates still verify role+tokenVersion server-side.
 */
export async function syncAdminRoleOnLogin(user: AuthUser): Promise<AuthUser> {
  if (!hasDb()) return user;
  try {
    const listed = await isAllowlisted(user.mobile);
    if (listed && user.role !== 'admin') {
      return (await updateUser(user.id, { role: 'admin' })) ?? user;
    }
    if (!listed && user.role === 'admin') {
      return (await updateUser(user.id, { role: 'customer' })) ?? user;
    }
  } catch {
    /* fail open for CUSTOMER login, closed for admin: an un-synced admin
       still passes gates only if their row really has role=admin. */
  }
  return user;
}

/** Seed/bootstrap: upsert env-declared admins (never removes anything). */
export async function bootstrapAllowlist(mobiles: string[]): Promise<number> {
  let n = 0;
  for (const mobile of mobiles) {
    await getDb()
      .insert(adminAllowlist)
      .values({ mobile, label: 'bootstrap (ADMIN_MOBILES)', addedBy: null })
      .onConflictDoNothing();
    const existing = await userByMobile(mobile);
    if (existing && existing.role !== 'admin') await updateUser(existing.id, { role: 'admin' });
    n++;
  }
  return n;
}
