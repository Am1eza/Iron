import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { warehouseMovementsForItem, warehouseItemExists } from '@/lib/server/repos/ordersRepo';

/** GET /api/admin/warehouse/{id}/movements — the append-only quantity
 *  history for one item (W20): every receipt, partial/full release, and
 *  correction, instead of a single mutable number with no memory of how it
 *  got there. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await warehouseItemExists(id))) {
    return NextResponse.json({ error: 'not_found', message: 'کالا یافت نشد.' }, { status: 404 });
  }
  const movements = await warehouseMovementsForItem(id);
  return NextResponse.json({ movements }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
