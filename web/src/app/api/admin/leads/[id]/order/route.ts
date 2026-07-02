import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { findLead, leadItemsOf, toLineItem, updateLead } from '@/lib/server/repos/leadsRepo';
import { createOrder } from '@/lib/server/repos/ordersRepo';
import { nextRef } from '@/lib/server/utils/refs';

/** POST /api/admin/leads/{id}/order — convert a won lead into a tracked order. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const lead = await findLead(id);
  if (!lead) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });

  const items = (await leadItemsOf(id)).map(toLineItem);
  const ref = await nextRef('OR');
  const order = await createOrder({ ref, userId: lead.userId ?? undefined, leadId: id, items });
  await updateLead(id, { status: 'won' });
  await audit(auth.session.id, 'lead.order', { type: 'lead', id }, null, { orderRef: ref });
  return NextResponse.json({ order }, { status: 201 });
}
