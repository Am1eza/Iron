import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { overviewStats } from '@/lib/server/repos/analyticsRepo';

/** GET /api/admin/stats/overview — KPI cards with complete-period deltas +
 *  30-day sparkline series for the management dashboard. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  return NextResponse.json(await overviewStats());
}

export const GET = withApiErrorHandling(GETImpl);
