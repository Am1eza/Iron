import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListAlerts, DEFAULT_ALERT_TIER_CAPS } from '@/lib/server/repos/alertsRepo';
import { getSetting } from '@/lib/server/repos/settingsRepo';

/** GET /api/admin/alerts?status=&q=&page= — every user's price alerts
 *  (US-24.5, search/total added W22). OP/ADM only admin surface for
 *  قیمت‌سنج; there was none before this. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const validStatus = status === 'active' || status === 'triggered' || status === 'paused' ? status : undefined;
  const [{ rows, total }, caps] = await Promise.all([
    adminListAlerts({
      status: validStatus,
      q: p.get('q') ?? undefined,
      page: Math.max(1, Number(p.get('page') ?? 1) || 1),
    }),
    // W22: per-tier caps (was one flat number under ALERT_MAX_ACTIVE_PER_USER).
    getSetting('ALERT_TIER_CAPS', DEFAULT_ALERT_TIER_CAPS),
  ]);
  return NextResponse.json({ alerts: rows, total, caps }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
