import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateOrderStatus, cancelOrder, InvalidStatusTransitionError } from '@/lib/server/repos/ordersRepo';

const payload = z.object({
  status: z.enum(['registered', 'confirmed', 'loading', 'in_transit', 'delivered']),
});

/** PATCH /api/admin/orders/{ref} — advance the shipment stepper. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  let order;
  try {
    order = await updateOrderStatus(decodeURIComponent(ref), v.data.status);
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ error: 'invalid_transition', message: 'وضعیت سفارش را نمی‌توان به عقب برد.' }, { status: 409 });
    }
    throw err;
  }
  if (!order) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'order.status', { type: 'order', id: order.ref }, null, v.data);
  return NextResponse.json({ order });
}

/** DELETE /api/admin/orders/{ref} — cancel/archive (mis-registered,
 *  duplicate, customer cancelled before shipment). Preserves the record. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;
  const order = await cancelOrder(decodeURIComponent(ref));
  if (!order) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'order.cancel', { type: 'order', id: order.ref }, null, null);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
