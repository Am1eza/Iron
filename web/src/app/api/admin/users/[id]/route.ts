import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listUsers, updateUser, userById, revokeAllForUser } from '@/lib/auth/store';
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

  // Never demote/deactivate the last admin (lock-out guard).
  const demoting = (v.data.role && before.role === 'admin' && v.data.role !== 'admin') || v.data.isActive === false;
  if (demoting && before.role === 'admin') {
    const { users: admins } = await listUsers({ role: 'admin', perPage: 2 });
    if (admins.length <= 1) {
      return NextResponse.json(
        { error: 'last_admin', message: 'آخرین مدیر سیستم را نمی‌توان حذف یا تنزل داد.' },
        { status: 409 },
      );
    }
  }

  const user = await updateUser(id, v.data);
  // Role/active changes end existing sessions.
  if (v.data.role || v.data.isActive === false) await revokeAllForUser(id);
  await audit(auth.session.id, 'user.update', { type: 'user', id }, { role: before.role }, v.data);
  return NextResponse.json({ user });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
