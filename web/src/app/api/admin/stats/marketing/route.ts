import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { marketingStats } from '@/lib/server/repos/analyticsRepo';

/** GET /api/admin/stats/marketing — channel attribution, entry-cohort funnel,
 *  speed-to-lead (median/p90), repeat rate, SMS delivery. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  return NextResponse.json(await marketingStats());
}

export const GET = withApiErrorHandling(GETImpl);
