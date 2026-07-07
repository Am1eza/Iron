import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { cohortRetention } from '@/lib/server/repos/analyticsRepo';

/** GET /api/admin/stats/cohorts — signup-cohort retention heatmap. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  return NextResponse.json(await cohortRetention());
}

export const GET = withApiErrorHandling(GETImpl);
