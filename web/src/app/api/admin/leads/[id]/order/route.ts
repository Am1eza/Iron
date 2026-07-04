import type { NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { withIdempotency } from '@/lib/server/utils/idempotency';
import { findLead, leadItemsOf, toLineItem, updateLead } from '@/lib/server/repos/leadsRepo';
import { createOrder } from '@/lib/server/repos/ordersRepo';
import { nextRef } from '@/lib/server/utils/refs';

/** POST /api/admin/leads/{id}/order — convert a won lead into a tracked order.
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

    const items = (await leadItemsOf(id)).map(toLineItem);
    const ref = await nextRef('OR');
    const order = await createOrder({ ref, userId: lead.userId ?? undefined, leadId: id, items });
    await updateLead(id, { status: 'won' });
    await audit(auth.session.id, 'lead.order', { type: 'lead', id }, null, { orderRef: ref });
    return { status: 201, body: { order } };
  });
}

export const POST = withApiErrorHandling(POSTImpl);
