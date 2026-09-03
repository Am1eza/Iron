import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { seoStats } from '@/lib/server/repos/analyticsRepo';
import { matomoSeoInsights } from '@/lib/server/integrations/matomo';

/** GET /api/admin/stats/seo — self-computed SEO health (weighted score,
 *  on-page pass-rates, failing articles, cadence/freshness, catalog
 *  visibility) plus, when Matomo is configured, which organic-search
 *  traffic is actually landing where — same "null when unreachable, never
 *  fails the page" contract as the marketing dashboard's `traffic` field. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const [stats, traffic] = await Promise.all([seoStats(), matomoSeoInsights(30)]);
  return NextResponse.json({ ...stats, traffic });
}

export const GET = withApiErrorHandling(GETImpl);
