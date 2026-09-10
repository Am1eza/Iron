import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateUser, userById, revokeAllForUser } from '@/lib/auth/store';
import { getDb } from '@/lib/server/db/client';
import { users } from '@/lib/server/db/schema';
import { BusinessRuleError } from '@/lib/server/utils/businessOperation';
import { publicUser } from '@/lib/auth/publicUser';
import { leadsForUser } from '@/lib/server/repos/leadsRepo';
import { ordersForUser } from '@/lib/server/repos/ordersRepo';
import { aiUsageSummaryForUser } from '@/lib/server/repos/userActivityRepo';

const DETAIL_PAGE_SIZE = 20;

/** GET /api/admin/users/{id} — profile + a recent-activity snapshot (leads/
 *  orders/AI usage) for the user-detail tab (US-21.3). Only the first page
 *  of leads/orders — this is a "recent activity" glance, not a full export
 *  (use GET /api/me/{leads,orders} pagination or /api/admin/leads for that). */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;

  const user = await userById(id);
  if (!user) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });

  const [leads, orders, aiUsageSummary] = await Promise.all([
    leadsForUser(id, user.mobile, 1, DETAIL_PAGE_SIZE),
    ordersForUser(id, 1, DETAIL_PAGE_SIZE),
    aiUsageSummaryForUser(id),
  ]);

  return NextResponse.json(
    {
      user: publicUser(user),
      leads: leads.rows,
      leadsHasMore: leads.hasMore,
      orders: orders.rows,
      ordersHasMore: orders.hasMore,
      aiUsage: aiUsageSummary,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const payload = z.object({
  role: z.enum(['customer', 'operator', 'sales', 'content', 'catalog', 'admin']).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
});

/** PATCH /api/admin/users/{id} — role / active / name. Guards the last admin. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const before = await userById(id);
  if (!before) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });

  // The admin role is governed EXCLUSIVELY by the admin allowlist (tab
  // «مدیران») — allowing it here would silently be reverted on the target's
  // next login by the allowlist sync, a confusing half-state.
  if (v.data.role && (v.data.role === 'admin') !== (before.role === 'admin')) {
    return NextResponse.json(
      { error: 'admin_via_allowlist', message: 'نقش «مدیر سیستم» فقط از بخش «مدیران» (فهرست مجاز) تغییر می‌کند.' },
      { status: 409 },
    );
  }

  // Never demote/deactivate the last ACTIVE admin (lock-out guard). Reachable
  // only via `isActive: false` in practice — the check above already refuses
  // any role value that would flip admin-ness.
  const demoting = (v.data.role && before.role === 'admin' && v.data.role !== 'admin') || v.data.isActive === false;

  // The write and its audit row commit together (G-160): a failure inserting
  // the audit entry rolls back the role/active-state change too, instead of
  // silently leaving an unattributed change with no trail — see audit()'s
  // doc comment for why that's the right trade-off specifically when `tx`
  // is supplied.
  //
  // G-159 follow-up (found this session): the last-admin count used to be a
  // plain `listUsers({role:'admin'})` read BEFORE this transaction opened —
  // two concurrent PATCHes deactivating two DIFFERENT admins could each
  // observe "2 admins, safe" and both proceed, leaving zero (the exact race
  // proven — and fixed the same way — in adminAllowlistRepo.ts's
  // lockAdminRowsAndTarget). It also never filtered `isActive`, so an
  // already-inactive admin row (e.g. one who self-deleted via `/api/me`,
  // which does not touch `role`) silently inflated the count and could let
  // the true last active admin be deactivated anyway. Both are fixed here:
  // the check now runs UNDER a `FOR UPDATE` lock on every currently-active
  // admin row, inside the same transaction as the write.
  const user = await getDb().transaction(async (tx) => {
    if (demoting && before.role === 'admin') {
      const activeAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.isActive, true)))
        .for('update');
      if (activeAdmins.length <= 1) {
        throw new BusinessRuleError('last_admin', 'آخرین مدیر سیستم را نمی‌توان حذف یا تنزل داد.', 409);
      }
    }
    const updated = await updateUser(id, v.data, tx);
    await audit(auth.session.id, 'user.update', { type: 'user', id }, { role: before.role }, v.data, tx);
    return updated;
  });
  // Role/active changes end existing sessions. Redundant with the delete
  // updateUser's own role/isActive branch already did inside that same
  // transaction — kept as a defense-in-depth no-op for any other revocation
  // bookkeeping revokeAllForUser does beyond that row.
  if (v.data.role || v.data.isActive === false) await revokeAllForUser(id);
  return NextResponse.json({ user });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
