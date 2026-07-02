import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { marketHistory } from '@/lib/server/repos/marketRepo';
import type { MarketKey } from '@/lib/types/domain';

const KEYS: MarketKey[] = ['usd', 'eur', 'gold18', 'ounce', 'billet'];

/** GET /api/market/{key}/history?range= — ticker chart series. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { key } = await ctx.params;
  if (!KEYS.includes(key as MarketKey)) {
    return NextResponse.json({ error: 'not_found', message: 'شاخص یافت نشد.' }, { status: 404 });
  }
  const range = req.nextUrl.searchParams.get('range') ?? '30d';
  const points = await marketHistory(key as MarketKey, range);
  return NextResponse.json(
    { points },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
