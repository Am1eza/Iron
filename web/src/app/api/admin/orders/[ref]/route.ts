import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateOrderStatus } from '@/lib/server/repos/ordersRepo';

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
  const order = await updateOrderStatus(decodeURIComponent(ref), v.data.status);
  if (!order) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'order.status', { type: 'order', id: order.ref }, null, v.data);
  return NextResponse.json({ order });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
