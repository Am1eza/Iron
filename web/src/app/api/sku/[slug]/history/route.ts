import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { skuHistory } from '@/lib/server/repos/catalogRepo';

/** GET /api/sku/{slug}/history?range=7d|30d|90d|1y — chart series. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { slug } = await ctx.params;
  const range = req.nextUrl.searchParams.get('range') ?? '90d';
  const points = await skuHistory(decodeURIComponent(slug), range);
  return NextResponse.json(
    { points },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
