import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { pageSpeedInsights } from '@/lib/server/integrations/pagespeed';

/** GET /api/admin/stats/seo/pagespeed — real Core Web Vitals + Lighthouse
 *  SEO/performance scores for the homepage and `/prices`, from Google's
 *  PageSpeed Insights API. Split out from `/api/admin/stats/seo` on
 *  purpose: a cache-miss call to PSI can take 10-20s, which would stall
 *  that route's 5-minute polling for everyone with the panel open. This
 *  endpoint is fetched separately, once, with a 24h-cached result. */
async function GETImpl(req: NextRequest) {
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ results: await pageSpeedInsights() });
}

export const GET = withApiErrorHandling(GETImpl);
