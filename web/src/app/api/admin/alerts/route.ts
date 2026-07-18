import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListAlerts } from '@/lib/server/repos/alertsRepo';
import { getSetting } from '@/lib/server/repos/settingsRepo';

/** GET /api/admin/alerts — every user's price alerts (US-24.5). OP/ADM only
 *  admin surface for قیمت‌سنج; there was none before this. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const validStatus = status === 'active' || status === 'triggered' || status === 'paused' ? status : undefined;
  const [{ rows, hasMore }, cap] = await Promise.all([
    adminListAlerts({ status: validStatus, page: Math.max(1, Number(p.get('page') ?? 1) || 1) }),
    getSetting<number>('ALERT_MAX_ACTIVE_PER_USER', 20),
  ]);
  return NextResponse.json({ alerts: rows, hasMore, cap }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
