import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findLead, leadItemsOf, toLineItem } from '@/lib/server/repos/leadsRepo';
import { issueProforma, proformaSmsText } from '@/lib/server/services/leads.service';
import { sendSms } from '@/lib/server/integrations/smsir';

/** POST /api/admin/leads/{id}/proforma — issue/re-issue from current lead items
 *  (snapshot already priced at lead creation; sales adjusts via lead items later). */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const lead = await findLead(id);
  if (!lead) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });

  const items = (await leadItemsOf(id)).map(toLineItem);
  const priced = items.filter((i) => i.unitPrice);
  if (priced.length === 0) {
    return NextResponse.json(
      { error: 'unpriced', message: 'هیچ قلم قیمت‌داری روی این سرنخ نیست.' },
      { status: 409 },
    );
  }
  const proforma = await issueProforma(lead, priced);
  await sendSms(lead.contactMobile, proformaSmsText(proforma.ref, proforma.total, proforma.validUntil), 'proforma');
  await audit(auth.session.id, 'lead.proforma', { type: 'lead', id }, null, { ref: proforma.ref, total: proforma.total });
  return NextResponse.json({ proforma }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);
