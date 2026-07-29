import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import {
  updateOrderStatus,
  updateOrderShipping,
  cancelOrder,
  orderOwnership,
  InvalidStatusTransitionError,
} from '@/lib/server/repos/ordersRepo';
import { leadOwnerInfo } from '@/lib/server/repos/leadsRepo';
import { userById } from '@/lib/auth/store';
import { canActOnAssignedRecord } from '@/lib/auth/roles';
import {
  orderStatusSmsNotification,
  orderShippingSmsNotification,
  orderCancelledSmsNotification,
} from '@/lib/server/services/leads.service';
import { sendNotification } from '@/lib/server/integrations/smsir';

const payload = z
  .object({
    status: z.enum(['registered', 'confirmed', 'loading', 'in_transit', 'delivered']).optional(),
    // US-08.4 — carrier tracking, independent of the status stepper.
    // Empty string clears the field (nullable, not required).
    trackingNumber: z.string().trim().max(100).optional(),
    carrierName: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.status !== undefined || v.trackingNumber !== undefined || v.carrierName !== undefined, {
    message: 'حداقل یک فیلد باید ارسال شود.',
  });

function decodeRefOrNull(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** The order's source lead (for ownership + its contact mobile), or null for
 *  an order somehow created without one — falls back to the account's own
 *  mobile so a notification still has somewhere to go.
 *
 *  Uses leadOwnerInfo, NOT findLead: findLead hides an archived lead
 *  entirely, which would silently turn `assigneeId` into `null` — "nobody's
 *  toes to step on" — reopening a converted order to any leads:write rep
 *  the moment its source lead is later archived for something unrelated
 *  (spam/duplicate cleanup). The order itself is unaffected by that
 *  archival, so its ownership shouldn't be either. */
async function resolveOwnerAndMobile(
  snapshot: { leadId: string | null; userId: string | null },
): Promise<{ assigneeId: string | null; mobile: string | null; name: string | null }> {
  if (snapshot.leadId) {
    const lead = await leadOwnerInfo(snapshot.leadId);
    if (lead) return { assigneeId: lead.assigneeId, mobile: lead.contactMobile, name: lead.contactName };
  }
  const user = snapshot.userId ? await userById(snapshot.userId) : null;
  return { assigneeId: null, mobile: user?.mobile ?? null, name: user?.name ?? null };
}

/** PATCH /api/admin/orders/{ref} — advance the shipment stepper and/or set
 *  carrier tracking info (US-08.4). Either or both in one request. Ownership-
 *  scoped like leads (W16): only the source lead's assignee, or a manager
 *  (leads:manage), may touch an order — a `leads:write`-only colleague gets
 *  a clear 403 instead of silently being able to alter anyone's shipment. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const decodedRef = decodeRefOrNull(ref);
  if (decodedRef === null) {
    return NextResponse.json({ error: 'bad_ref', message: 'کد سفارش نامعتبر است.' }, { status: 400 });
  }

  const snapshot = await orderOwnership(decodedRef);
  if (!snapshot) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });

  const { assigneeId, mobile, name } = await resolveOwnerAndMobile(snapshot);
  if (!canActOnAssignedRecord(auth.session, assigneeId)) {
    return NextResponse.json(
      {
        error: 'order_forbidden',
        message: 'این سفارش به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند آن را تغییر دهد.',
      },
      { status: 403 },
    );
  }

  let order;
  let smsSent: boolean | undefined;

  const status = v.data.status;
  if (status !== undefined) {
    let statusResult;
    try {
      statusResult = await updateOrderStatus(decodedRef, status);
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return NextResponse.json({ error: 'invalid_transition', message: 'وضعیت سفارش را نمی‌توان به عقب برد.' }, { status: 409 });
      }
      throw err;
    }
    if (!statusResult) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });
    order = statusResult.order;
    // prevStatus comes from INSIDE updateOrderStatus's row-locked read — the
    // race-proof "did this actually change" answer, unlike `snapshot.status`
    // (read before the lock, so it can be stale under a concurrent PATCH).
    // Reused for both the audit "before" value and the SMS-dedup guard below.
    const prevStatus = statusResult.prevStatus;
    await audit(
      auth.session.id,
      'order.status',
      { type: 'order', id: decodedRef },
      { status: prevStatus },
      { status },
    );
    // 'registered' is the creation state, already announced by the
    // order-creation SMS. A same-status "advance" (double-click, a retried
    // request after a client timeout) isn't a real transition either —
    // assertForwardTransition allows status === prevStatus as a no-op, and
    // without this guard that no-op would still text the customer again.
    if (mobile && status !== 'registered' && status !== prevStatus) {
      const sms = await sendNotification(mobile, orderStatusSmsNotification(decodedRef, name, status));
      smsSent = sms.ok;
    }
  }

  if (v.data.trackingNumber !== undefined || v.data.carrierName !== undefined) {
    const nextTracking = v.data.trackingNumber === '' ? null : v.data.trackingNumber;
    const nextCarrier = v.data.carrierName === '' ? null : v.data.carrierName;
    order = await updateOrderShipping(decodedRef, { trackingNumber: nextTracking, carrierName: nextCarrier });
    if (!order) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });
    await audit(
      auth.session.id,
      'order.shipping',
      { type: 'order', id: decodedRef },
      { trackingNumber: snapshot.trackingNumber, carrierName: snapshot.carrierName },
      { trackingNumber: nextTracking, carrierName: nextCarrier },
    );
    // Only the moment a REAL tracking number lands is "go check this now" —
    // clearing it, or only naming a carrier with no number yet, is not.
    if (mobile && nextTracking && nextTracking !== snapshot.trackingNumber) {
      const sms = await sendNotification(mobile, orderShippingSmsNotification(decodedRef, name, nextTracking, nextCarrier ?? null));
      smsSent = sms.ok;
    }
  }

  return NextResponse.json({ order, smsSent });
}

/** DELETE /api/admin/orders/{ref} — cancel/archive (mis-registered,
 *  duplicate, customer cancelled before shipment). Preserves the record.
 *
 *  `leads:manage`, not `leads:write` (W16 precedent, same as archiving a
 *  lead): this makes a real transaction disappear from the working set and
 *  from the customer's active-order view — it had no ownership check at all
 *  before, so any rep could cancel any colleague's order. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage');
  if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;

  const decodedRef = decodeRefOrNull(ref);
  if (decodedRef === null) {
    return NextResponse.json({ error: 'bad_ref', message: 'کد سفارش نامعتبر است.' }, { status: 400 });
  }

  const snapshot = await orderOwnership(decodedRef);
  if (!snapshot) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });

  const order = await cancelOrder(decodedRef);
  if (!order) return NextResponse.json({ error: 'not_found', message: 'سفارش یافت نشد.' }, { status: 404 });

  await audit(
    auth.session.id,
    'order.cancel',
    { type: 'order', id: decodedRef },
    { status: snapshot.status },
    null,
  );

  const { mobile, name } = await resolveOwnerAndMobile(snapshot);
  const smsSent = mobile ? (await sendNotification(mobile, orderCancelledSmsNotification(decodedRef, name))).ok : undefined;

  return NextResponse.json({ ok: true, smsSent });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
