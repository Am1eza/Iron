import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { findLead, leadItemsOf, toLineItem } from '@/lib/server/repos/leadsRepo';
import { issueProforma } from '@/lib/server/services/leads.service';
import { sendTemplateSms } from '@/lib/server/integrations/kavenegar';

/** POST /api/admin/leads/{id}/proforma — issue/re-issue from current lead items
 *  (snapshot already priced at lead creation; sales adjusts via lead items later). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  await sendTemplateSms(
    lead.contactMobile,
    process.env.KAVENEGAR_PROFORMA_TEMPLATE ?? 'ahantime-proforma',
    { token: proforma.ref, token2: String(proforma.total) },
    'proforma',
  );
  await audit(auth.session.id, 'lead.proforma', { type: 'lead', id }, null, { ref: proforma.ref, total: proforma.total });
  return NextResponse.json({ proforma }, { status: 201 });
}
