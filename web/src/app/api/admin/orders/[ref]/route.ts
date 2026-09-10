import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { mutateOrder, InvalidStatusTransitionError } from '@/lib/server/repos/ordersRepo';
const payload = z.object({
  status: z.enum(['registered','confirmed','loading','in_transit','delivered']).optional(),
  trackingNumber: z.string().trim().max(100).optional(),
  carrierName: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
}).refine(v => v.status !== undefined || v.trackingNumber !== undefined || v.carrierName !== undefined);
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb(); if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write'); if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload); if (!v.ok) return v.response;
  const { ref } = await ctx.params;
  try {
    const result = await mutateOrder(ref, { ...v.data,
      trackingNumber: v.data.trackingNumber === '' ? null : v.data.trackingNumber,
      carrierName: v.data.carrierName === '' ? null : v.data.carrierName }, auth.session);
    if (!result) return NextResponse.json({ error: 'not_found', message: 'سفارش فعال یافت نشد.' }, { status: 404 });
    return NextResponse.json({ order: result.order, smsQueued: true });
  } catch (error) {
    if (error instanceof InvalidStatusTransitionError) return NextResponse.json({ error: 'invalid_transition', message: error.message }, { status: 409 });
    throw error;
  }
}
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb(); if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage'); if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;
  const result = await mutateOrder(ref, { cancel: true }, auth.session);
  if (!result) return NextResponse.json({ error: 'not_found', message: 'سفارش فعال یافت نشد.' }, { status: 404 });
  return NextResponse.json({ ok: true, order: result.order, smsQueued: true });
}
export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
