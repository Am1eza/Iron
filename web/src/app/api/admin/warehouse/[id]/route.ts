import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateWarehouseItem, softDeleteWarehouseItem, InvalidStatusTransitionError } from '@/lib/server/repos/ordersRepo';
import { finiteNumber } from '@/lib/validation/utils';

const payload = z.object({
  status: z.enum(['pending', 'stored', 'selling', 'released']).optional(),
  monthlyFeeToman: finiteNumber.min(0).max(1e12).optional(),
  quantityTons: finiteNumber.positive().max(100000).optional(),
});

/** PATCH /api/admin/warehouse/{id} — status / fee / quantity. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  let item;
  try {
    item = await updateWarehouseItem(id, v.data);
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ error: 'invalid_transition', message: 'وضعیت کالا را نمی‌توان به عقب برد.' }, { status: 409 });
    }
    throw err;
  }
  if (!item) return NextResponse.json({ error: 'not_found', message: 'کالا یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'warehouse.update', { type: 'warehouseItem', id }, null, v.data);
  return NextResponse.json({ item });
}

/** DELETE /api/admin/warehouse/{id} — remove a mistakenly-created or
 *  duplicate entry from the working set without losing the record. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const item = await softDeleteWarehouseItem(id);
  if (!item) return NextResponse.json({ error: 'not_found', message: 'کالا یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'warehouse.delete', { type: 'warehouseItem', id }, null, null);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
