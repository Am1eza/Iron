import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb } from '@/lib/server/utils/apiGuard';
import { adminListOrders } from '@/lib/server/repos/ordersRepo';

/** GET /api/admin/orders?status=&page=. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const result = await adminListOrders({
    status:
      status && ['registered', 'confirmed', 'loading', 'in_transit', 'delivered'].includes(status)
        ? (status as 'registered')
        : undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
