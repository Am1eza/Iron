import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listUsers, createUser, userByMobile } from '@/lib/auth/store';
import { normalizeMobile } from '@/lib/utils/format';
import type { Role } from '@/lib/auth/types';

const ROLES: Role[] = ['customer', 'operator', 'sales', 'content', 'catalog', 'admin'];
// Staff roles creatable directly from this endpoint. 'admin' is deliberately
// excluded — same rule as the PATCH route's comment: the admin role is
// governed EXCLUSIVELY by the admin allowlist, so an account created here
// with role:'admin' would silently be reverted on its first login.
const INVITABLE_ROLES = ['operator', 'sales', 'content', 'catalog'] as const;

/** GET /api/admin/users?role=&q=&page=. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const role = p.get('role');
  const result = await listUsers({
    role: role && ROLES.includes(role as Role) ? (role as Role) : undefined,
    q: p.get('q') ?? undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  mobile: z.string().trim().min(1),
  name: z.string().trim().min(1).max(60).optional(),
  role: z.enum(INVITABLE_ROLES),
});

/** POST /api/admin/users — invite/create a staff account directly (US-21.4),
 *  bypassing the normal OTP-first-login signup: the admin picks the mobile
 *  + role up front, and the person just logs in with OTP as usual — their
 *  account (and role) already exists. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;

  const mobile = normalizeMobile(v.data.mobile);
  if (!mobile) {
    return NextResponse.json(
      { error: 'validation', message: 'شمارهٔ موبایل نامعتبر است.', fields: { mobile: ['فرمت نامعتبر'] } },
      { status: 400 },
    );
  }
  if (await userByMobile(mobile)) {
    return NextResponse.json(
      { error: 'mobile_exists', message: 'کاربری با این شماره موبایل از قبل وجود دارد.' },
      { status: 409 },
    );
  }

  const created = await createUser({ mobile, name: v.data.name, role: v.data.role });
  await audit(auth.session.id, 'user.create', { type: 'user', id: created.id }, undefined, {
    mobile,
    role: v.data.role,
  });
  return NextResponse.json({ user: created }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
