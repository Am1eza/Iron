import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { pendingWarehouseRequests } from '@/lib/server/repos/requestsRepo';

/** GET /api/admin/warehouse/requests — the intake queue (W21): every
 *  customer-submitted warehouse request not yet fulfilled, so a rep can go
 *  straight from "what did they ask for" to "receive it" without leaving the
 *  warehouse page or re-typing anything from the leads inbox. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const requests = await pendingWarehouseRequests();
  return NextResponse.json({ requests }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
