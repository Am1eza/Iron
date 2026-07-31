import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { skuHistory, RANGE_DAYS } from '@/lib/server/repos/catalogRepo';

/**
 * GET /api/admin/pricing/history/{slug}?range=7d|30d|90d|1y — the pricing
 * grid's per-SKU drilldown series.
 *
 * Deliberately NOT a reuse of the public `/api/sku/{slug}/history`, which
 * carries `Cache-Control: public, s-maxage=300`. That is right for the public
 * product page, but here the reader is the operator who may have just
 * corrected a fat-fingered price: showing them up to 10-minute-stale data at
 * the exact moment correctness matters is the one thing this drilldown must
 * never do. Same repo query, admin gate, `no-store`.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  // Same permission the grid itself is gated on — an operator who can write
  // prices can see how those prices moved.
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const { slug } = await ctx.params;
  const raw = req.nextUrl.searchParams.get('range');
  // Validated against the repo's OWN table (RANGE_DAYS) rather than a copy:
  // an unknown value falls back to 90d instead of being passed through.
  const range = raw && raw in RANGE_DAYS ? raw : '90d';

  const points = await skuHistory(decodeURIComponent(slug), range);
  return NextResponse.json({ points, range }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
