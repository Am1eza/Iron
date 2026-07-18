import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { withIdempotency } from '@/lib/server/utils/idempotency';
import { findLead, leadItemsOf, toLineItem } from '@/lib/server/repos/leadsRepo';
import { issueProforma, proformaSmsText } from '@/lib/server/services/leads.service';
import { sendSms } from '@/lib/server/integrations/smsir';

// Optional body — a bare POST (no body at all) is the common case and must
// keep working exactly as before; `discountToman` (US-19.4) is opt-in. The
// upper bound (can't exceed subtotal) is enforced in issueProforma itself,
// once the actual line-item subtotal is known — this only rejects a
// negative/non-integer value up front.
const payload = z
  .object({ discountToman: z.number().int().nonnegative().optional() })
  .nullable();

/** POST /api/admin/leads/{id}/proforma — issue/re-issue from current lead items
 *  (snapshot already priced at lead creation; sales adjusts via lead items later,
 *  see PATCH /api/admin/leads/{id}/items/{itemId}), optionally with a flat
 *  `discountToman` off the subtotal (US-19.4).
 *  Idempotent: a retry (network blip, admin double-click) within the same
 *  ~10s window — or any request carrying the same client `Idempotency-Key`
 *  header — replays the first response instead of issuing a second
 *  proforma/SMS. A deliberate re-issue tomorrow still gets a fresh one. */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;

  const rawBody: unknown = await req.json().catch(() => null);
  const parsedBody = payload.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'validation', message: 'ورودی نامعتبر است.' }, { status: 400 });
  }
  const discountToman = parsedBody.data?.discountToman ?? 0;

  return withIdempotency(
    req,
    'lead.proforma',
    `${id}:${auth.session.id}:${Math.floor(Date.now() / 10_000)}`,
    async () => {
      const lead = await findLead(id);
      if (!lead) return { status: 404, body: { error: 'not_found', message: 'سرنخ یافت نشد.' } };

      const items = (await leadItemsOf(id)).map(toLineItem);
      const priced = items.filter((i) => i.unitPrice);
      if (priced.length === 0) {
        return {
          status: 409,
          body: { error: 'unpriced', message: 'هیچ قلم قیمت‌داری روی این سرنخ نیست.' },
        };
      }
      const proforma = await issueProforma(lead, priced, undefined, discountToman);
      await sendSms(
        lead.contactMobile,
        proformaSmsText(proforma.ref, proforma.total, proforma.validUntil),
        'proforma',
      );
      await audit(auth.session.id, 'lead.proforma', { type: 'lead', id }, null, {
        ref: proforma.ref,
        total: proforma.total,
      });
      return { status: 201, body: { proforma } };
    },
  );
}

export const POST = withApiErrorHandling(POSTImpl);
