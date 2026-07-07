import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { seoStats } from '@/lib/server/repos/analyticsRepo';

/** GET /api/admin/stats/seo — self-computed SEO health: weighted score,
 *  on-page pass-rates, failing articles, cadence/freshness. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  return NextResponse.json(await seoStats());
}

export const GET = withApiErrorHandling(GETImpl);
