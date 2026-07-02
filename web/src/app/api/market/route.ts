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
  return NextResponse.json({ values }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
