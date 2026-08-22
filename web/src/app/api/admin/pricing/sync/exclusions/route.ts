import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listExcludedSkus, setPriceSyncExcluded } from '@/lib/server/repos/priceSyncRepo';

/** GET /api/admin/pricing/sync/exclusions — SKUs opted out of auto-pricing. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const skus = await listExcludedSkus();
  return NextResponse.json({ skus }, { headers: { 'Cache-Control': 'no-store' } });
}

const patchPayload = z.object({
  skuId: z.string().min(1).max(120),
  excluded: z.boolean(),
});

/**
 * PATCH /api/admin/pricing/sync/exclusions — flip one SKU's manual override.
 *
 * Deliberately one SKU at a time and deliberately not a workflow: the owner
 * asked for a flag and a toggle. `excluded: true` means the twice-daily mirror
 * leaves this SKU's price alone from the very next run.
 */
async function PATCHImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;

  const ok = await setPriceSyncExcluded(auth.session.id, v.data.skuId, v.data.excluded);
  if (!ok) return NextResponse.json({ error: 'کالا یافت نشد.' }, { status: 404 });
  return NextResponse.json({ skuId: v.data.skuId, excluded: v.data.excluded });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
