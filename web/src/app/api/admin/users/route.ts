import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listUsers } from '@/lib/auth/store';
import type { Role } from '@/lib/auth/types';

const ROLES: Role[] = ['customer', 'operator', 'sales', 'content', 'catalog', 'admin'];

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

export const GET = withApiErrorHandling(GETImpl);
