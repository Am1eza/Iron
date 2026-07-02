import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb } from '@/lib/server/utils/apiGuard';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { savePrices } from '@/lib/server/services/pricing.service';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';

/** GET /api/admin/pricing?cat=&sub= — the daily grid (rows incl. stale flags). */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const cat = req.nextUrl.searchParams.get('cat') ?? 'rebar';
  const sub = req.nextUrl.searchParams.get('sub') ?? undefined;
  const rows = await tableRows(cat, sub || undefined);
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}

const bulkPayload = z.object({
  prices: z
    .array(
      z.object({
        skuId: z.string().min(1),
        price: z.number().positive(),
        deliveryTime: z.string().trim().max(40).optional(),
        vatIncluded: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
});

/** PUT /api/admin/pricing — bulk daily save (movement + history + audit per row). */
export async function PUT(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, bulkPayload);
  if (!v.ok) return v.response;

  const results = await savePrices(auth.session.id, v.data.prices);
  // Fire alert evaluation inline so price alerts react immediately.
  void evaluateAlerts().catch(() => {});
  return NextResponse.json({ results });
}
