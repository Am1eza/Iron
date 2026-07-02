import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListMembers } from '@/lib/server/repos/clubRepo';

/** GET /api/admin/club/members. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'club:manage');
  if ('response' in auth) return auth.response;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1) || 1);
  const result = await adminListMembers(page);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
