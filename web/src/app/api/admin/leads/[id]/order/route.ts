import type { NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { withIdempotency } from '@/lib/server/utils/idempotency';
import { findLead, leadItemsOf, toLineItem, updateLead } from '@/lib/server/repos/leadsRepo';
import { createOrder } from '@/lib/server/repos/ordersRepo';
import { orderSmsNotification } from '@/lib/server/services/leads.service';
import { sendNotification } from '@/lib/server/integrations/smsir';
import { nextRef } from '@/lib/server/utils/refs';
import { canActOnAssignedRecord } from '@/lib/auth/roles';

/** POST /api/admin/leads/{id}/order — convert a won lead into a tracked order.
 *
 *  CONTRACT (the /admin/leads UI is built against this):
 *
 *  201 { order, smsSent }
 *    smsSent — the customer was texted their tracking ref. The rep was
 *              previously told the order was «قابل رهگیری در /track» while
 *              nothing at all was sent to the customer; now it is sent, and
 *              whether it LANDED is reported rather than assumed (sms.ir is
 *              currently 400-ing free-text sends in production). A failed send
 *              does not fail the conversion — the order exists and is
 *              trackable — so the UI should say «سفارش ساخته شد؛ ارسال پیامک
 *              ناموفق بود» and offer a resend, not an error toast.
 *
 *  Idempotent (see the proforma route's identical rationale) — a retry
 *  can't mint a second order ref for the same lead. */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;

  return withIdempotency(req, 'lead.order', `${id}:${auth.session.id}:${Math.floor(Date.now() / 10_000)}`, async () => {
    const lead = await findLead(id);
    if (!lead) return { status: 404, body: { error: 'not_found', message: 'سرنخ یافت نشد.' } };
    // Ownership-scoped like the order it's about to become (W16): only the
    // lead's assignee, or a manager, may convert it into a tracked order.
    if (!canActOnAssignedRecord(auth.session, lead.assigneeId)) {
      return {
        status: 403,
        body: { error: 'lead_forbidden', message: 'این سرنخ به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند آن را به سفارش تبدیل کند.' },
      };
    }

    const items = (await leadItemsOf(id)).map(toLineItem);
    const ref = await nextRef('OR');
    const order = await createOrder({ ref, userId: lead.userId ?? undefined, leadId: id, items });
    await updateLead(id, { status: 'won' });
    // AFTER the order is durable — an SMS is an external side effect that
    // can't be taken back, so it must never announce a ref that failed to
    // persist. Its outcome is reported, never fatal (see the contract above).
    const sms = await sendNotification(lead.contactMobile, orderSmsNotification(ref, lead.contactName));
    await audit(auth.session.id, 'lead.order', { type: 'lead', id }, { status: lead.status }, {
      orderRef: ref,
      status: 'won',
      smsSent: sms.ok,
    });
    return { status: 201, body: { order, smsSent: sms.ok } };
  });
}

export const POST = withApiErrorHandling(POSTImpl);
