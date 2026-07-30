import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListRequests } from '@/lib/server/repos/requestsRepo';
import { REQUEST_STATUSES, REQUEST_TYPES } from '@/lib/server/db/schema';

/** GET /api/admin/requests?status=&type=&page= — every user request, now
 *  filterable by type (W20 — warehouse asks used to be buried among
 *  proforma/bulk ones with no way to separate them) and carrying the
 *  customer's name/mobile so a rep can act without leaving the page. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const type = p.get('type');
  const result = await adminListRequests({
    status: status && (REQUEST_STATUSES as readonly string[]).includes(status) ? (status as (typeof REQUEST_STATUSES)[number]) : undefined,
    type: type && (REQUEST_TYPES as readonly string[]).includes(type) ? (type as (typeof REQUEST_TYPES)[number]) : undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
    perPage: p.get('perPage') ? Math.max(1, Number(p.get('perPage')) || 30) : undefined,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
