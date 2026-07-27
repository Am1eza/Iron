import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { addToAllowlist, allowlistCount, allowlistedRole, listAllowlist } from '@/lib/server/repos/adminAllowlistRepo';
import { revokeAllForUser } from '@/lib/auth/store';
import { normalizeDigits } from '@/lib/utils/format';

/** GET /api/admin/allowlist — who may hold the admin role (joined with users). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ entries: await listAllowlist() });
}

const payload = z.object({
  mobile: z
    .string()
    .trim()
    .transform((s) => normalizeDigits(s))
    .pipe(z.string().regex(/^09\d{9}$/, 'شمارهٔ موبایل معتبر نیست (۰۹xxxxxxxxx).')),
  label: z.string().trim().max(60).optional(),
  /** Defaults to 'admin' so any pre-role caller keeps its original meaning. */
  role: z.enum(['operator', 'sales', 'content', 'catalog', 'admin']).default('admin'),
});

/** POST /api/admin/allowlist — grant panel access with a role, or change an
 *  existing entry's role (mobile is the row's identity, so this is an upsert).
 *  Applied on the spot if the account exists; otherwise at their first login. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  // Demoting the last admin through a role change would lock everyone out of
  // access management just as surely as deleting the row — same guard.
  if (v.data.role !== 'admin' && (await allowlistedRole(v.data.mobile)) === 'admin') {
    if ((await allowlistCount()) <= 1) {
      return NextResponse.json(
        { error: 'last_admin', message: 'آخرین مدیر سیستم را نمی‌توان تنزل داد.' },
        { status: 409 },
      );
    }
  }

  const { promotedUserId } = await addToAllowlist(
    v.data.mobile,
    v.data.label ?? null,
    v.data.role,
    auth.session.id,
  );
  // A grant/re-role invalidates the target's existing sessions so their NEXT
  // request carries the new role via a fresh login/refresh, not a stale JWT.
  if (promotedUserId) await revokeAllForUser(promotedUserId);
  await audit(
    auth.session.id,
    'admin_allowlist.add',
    { type: 'admin_allowlist', id: v.data.mobile },
    undefined,
    { mobile: v.data.mobile, label: v.data.label ?? null, role: v.data.role, promotedUserId },
  );
  return NextResponse.json({ entries: await listAllowlist() }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
