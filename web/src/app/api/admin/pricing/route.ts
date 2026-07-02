import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { savePrices } from '@/lib/server/services/pricing.service';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { finiteNumber } from '@/lib/validation/utils';

/** GET /api/admin/pricing?cat=&sub= — the daily grid (rows incl. stale flags). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const cat = req.nextUrl.searchParams.get('cat') ?? 'rebar';
  const sub = req.nextUrl.searchParams.get('sub') ?? undefined;
  const rows = await tableRows(cat, sub || undefined);
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}

// Price ceiling: 1e13 Toman — far above any real per-unit steel price,
// comfortably below the JS safe-integer range (2^53 ≈ 9e15).
const bulkPayload = z.object({
  prices: z
    .array(
      z.object({
        skuId: z.string().min(1).max(120),
        price: finiteNumber.positive().max(1e13),
        deliveryTime: z.string().trim().max(40).optional(),
        vatIncluded: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * PUT /api/admin/pricing — bulk daily save (movement + history + audit per
 * row), with per-row fault isolation: a bad row is reported, not silently
 * dropped, and every other row still commits.
 */
async function PUTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, bulkPayload);
  if (!v.ok) return v.response;

  const results = await savePrices(auth.session.id, v.data.prices);
  const failed = results.filter((r) => !r.ok);
  // Fire alert evaluation inline so price alerts react immediately.
  void evaluateAlerts().catch(() => {});
  return NextResponse.json(
    { results, saved: results.length - failed.length, failed: failed.length },
    { status: failed.length > 0 && failed.length === results.length ? 422 : 200 },
  );
}

export const GET = withApiErrorHandling(GETImpl);
export const PUT = withApiErrorHandling(PUTImpl);
