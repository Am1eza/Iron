import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb } from '@/lib/server/utils/apiGuard';
import { adminListRequests } from '@/lib/server/repos/requestsRepo';

/** GET /api/admin/requests?status=&page= — every user request. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const result = await adminListRequests({
    status:
      status && ['submitted', 'reviewing', 'contacted', 'quoted'].includes(status)
        ? (status as 'submitted')
        : undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
