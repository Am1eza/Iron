import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { listUsers, updateUser, userById, revokeAllForUser } from '@/lib/auth/store';

const payload = z.object({
  role: z.enum(['customer', 'operator', 'sales', 'content', 'catalog', 'admin']).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
});

/** PATCH /api/admin/users/{id} — role / active / name. Guards the last admin. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const before = await userById(id);
  if (!before) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });

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
