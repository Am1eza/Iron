import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import {
  marketingStats,
  dormantCustomers,
  MARKETING_RANGES,
  type MarketingRange,
} from '@/lib/server/repos/analyticsRepo';
import { matomoSummary } from '@/lib/server/integrations/matomo';

/** Allowlist, not a clamp: this value windows every query on the page, so an
 *  unrecognised `range` falls back to the documented default rather than
 *  being coerced into some nearby number the caller never asked for. */
function parseRange(raw: string | null): MarketingRange {
  const n = Number(raw);
  return (MARKETING_RANGES as readonly number[]).includes(n) ? (n as MarketingRange) : 30;
}

/** GET /api/admin/stats/marketing?range=7|30|90 — entry-form and campaign
 *  attribution (leads / reached-proforma / won / toman), lead-cohort funnel,
 *  speed-to-lead, repeat rate, SMS delivery, and the dormant-customer list. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  const range = parseRange(req.nextUrl.searchParams.get('range'));
  // Dormancy is a standing "who should we call" list, deliberately NOT
  // windowed by `range` — a customer quiet for 8 months does not stop being
  // worth a call because the report is currently showing 7 days.
  const [stats, dormant, traffic] = await Promise.all([
    marketingStats(range),
    dormantCustomers(),
    // Null whenever Matomo is unconfigured or unreachable — the panel's own
    // numbers must render regardless.
    matomoSummary(range),
  ]);
  return NextResponse.json({ ...stats, dormant, traffic }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
