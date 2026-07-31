import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { customerSettlementOverview } from '@/lib/server/repos/warehouseSettlementsRepo';

/** GET /api/admin/warehouse/settlements/customers — every customer with at
 *  least one active consignment item, sorted by unsettled amount descending
 *  (US-08.5) — the admin's starting point for "who do I need to settle
 *  with", before drilling into GET .../settlements?userId=. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  // grandTotalUnsettledToman is summed on the server, where the per-item
  // numbers are already in hand — the headline is then a fact about the
  // warehouse rather than "the sum of whatever the client happened to load".
  // `truncated` says so out loud when the repo's item cap kicked in.
  const { customers, grandTotalUnsettledToman, truncated } = await customerSettlementOverview();
  return NextResponse.json(
    { customers, grandTotalUnsettledToman, truncated },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
