import { NextResponse } from 'next/server';
import { hasDb } from '@/lib/server/db/client';
import { listMarketValues, MARKET_CACHE_KEY } from '@/lib/server/repos/marketRepo';
import { marketValues as fixtureValues } from '@/lib/mock/fixtures';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { cacheGetJson, cacheSetJson } from '@/lib/server/redis';

/** GET /api/market — ticker values (tgju FX/gold/ounce + admin billet).
 *  Redis read-through (30s) offloads the sitewide 60s ticker poll from the DB;
 *  the poll job refreshes the underlying data, so bounded 30s staleness is fine.
 *  Falls straight through to the DB when Redis is unavailable. */
async function GETImpl() {
  const cached = await cacheGetJson<Awaited<ReturnType<typeof listMarketValues>>>(MARKET_CACHE_KEY);
  const values = cached ?? (hasDb() ? await listMarketValues() : fixtureValues);
  if (!cached && hasDb()) void cacheSetJson(MARKET_CACHE_KEY, values, 30);
  // Public, non-personalized ticker data polled sitewide every 60s. A short
  // shared cache (with SWR) lets the browser/any edge cache absorb the polling
  // instead of hitting the origin+DB on every tick, while staying fresh enough
  // for a market ticker. (Was `no-store`, which forced an origin round-trip
  // for every client every 60s.)
  return NextResponse.json(
    { values },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=45, stale-while-revalidate=90' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
