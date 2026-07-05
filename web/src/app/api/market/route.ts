import { NextResponse } from 'next/server';
import { hasDb } from '@/lib/server/db/client';
import { listMarketValues } from '@/lib/server/repos/marketRepo';
import { marketValues as fixtureValues } from '@/lib/mock/fixtures';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/** GET /api/market — ticker values (tgju FX/gold/ounce + admin billet).
 *  Served from the DB (the poll job keeps it fresh); fixture fallback keeps
 *  dev without a DB working. */
async function GETImpl() {
  const values = hasDb() ? await listMarketValues() : fixtureValues;
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
