import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { dashboardStats, DASHBOARD_RANGES, type DashboardRange } from '@/lib/server/repos/analyticsRepo';

/** GET /api/admin/stats/dashboard?range=7|30|90 — the whole management
 *  dashboard in one round trip (KPIs, trend, funnel, channels, pipeline,
 *  best sellers, team, health). An unknown/absent range falls back to 30
 *  rather than 400ing: the window is a view preference, not a command. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  const raw = Number(req.nextUrl.searchParams.get('range'));
  const range = (DASHBOARD_RANGES as readonly number[]).includes(raw) ? (raw as DashboardRange) : 30;
  return NextResponse.json(await dashboardStats(range));
}

export const GET = withApiErrorHandling(GETImpl);
