import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { aiUsageDailySeries } from '@/lib/server/repos/aiUsageRepo';

/** GET /api/admin/ai/usage?days=14 — daily token/violation series for the
 *  AI usage console (US-24.3). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 14) || 14, 1), 90);
  const series = await aiUsageDailySeries(days);
  return NextResponse.json({ series }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
