import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { withIdempotency } from '@/lib/server/utils/idempotency';
import { findLead, leadItemsOf, toLineItem } from '@/lib/server/repos/leadsRepo';
import {
  activeProformaOfLead,
  issueProforma,
  markLeadQuoted,
  proformaSmsNotification,
} from '@/lib/server/services/leads.service';
import { sendNotification } from '@/lib/server/integrations/smsir';
import { formatJalali } from '@/lib/utils/jalali';
import { canActOnAssignedRecord } from '@/lib/auth/roles';

// Optional body — a bare POST (no body at all) is the common case and must
// keep working exactly as before; `discountToman` (US-19.4) is opt-in. The
// upper bound (can't exceed subtotal) is enforced in issueProforma itself,
// once the actual line-item subtotal is known — this only rejects a
// negative/non-integer value up front. `reissue` is the deliberate-intent
// flag for replacing an outstanding quote (see the 409 below).
const payload = z
  .object({
    discountToman: z.number().int().nonnegative().optional(),
    reissue: z.boolean().optional(),
  })
  .nullable();

/** POST /api/admin/leads/{id}/proforma — issue/re-issue from current lead items
 *  (snapshot already priced at lead creation; sales adjusts via lead items later,
 *  see PATCH /api/admin/leads/{id}/items/{itemId}), optionally with a flat
 *  `discountToman` off the subtotal (US-19.4).
 *
 *  CONTRACT (the /admin/leads UI is built against this):
 *
 *  Request body (all optional, a bare POST is valid):
 *    { discountToman?: number, reissue?: boolean }
 *
 *  201 { proforma, smsSent, leadStatus, requestSynced, supersededRef }
 *    smsSent       — did the customer actually GET the ref? The UI must not
 *                    hard-code «و پیامک شد»; sms.ir is currently 400-ing every
 *                    free-text send in production and the rep was told the
 *                    customer had been texted regardless. The proforma is
 *                    validly issued either way, hence 201 and not an error:
 *                    say «صادر شد؛ ارسال پیامک ناموفق بود» and offer a resend.
 *    leadStatus    — the lead's status AFTER issuance ('new' auto-advances to
 *                    'contacted'; won/lost are left alone). Repaint the badge
 *                    from this instead of assuming it didn't change.
 *    requestSynced — the customer's mirrored /account/requests row moved to
 *                    «قیمت‌گذاری شد». False for a guest lead with no account.
 *    supersededRef — the ref of the quote this issuance VOIDED, or null. Show
 *                    it: the customer's old quote is now dead.
 *
 *  409 { error: 'proforma_active', message, proforma: { ref, total, validUntil } }
 *    The lead already has an outstanding, unexpired quote. Re-issue is a
 *    legitimate operation (price moved, customer asked again) — but it must be
 *    DELIBERATE, so the UI confirms with the rep, naming `proforma.ref`, and
 *    retries with `{ reissue: true }`. Without this gate a rep who waited out
 *    the 10s idempotency window, saw the toast gone, assumed failure and
 *    clicked again sent the customer a SECOND quote under a DIFFERENT ref with
 *    a different total — and proformaReminders then texted them both.
 *
 *  Idempotent: a retry (network blip, admin double-click) within the same
 *  ~10s window — or any request carrying the same client `Idempotency-Key`
 *  header — replays the first response instead of issuing a second
 *  proforma/SMS. The `reissue` gate is what covers everything beyond it. */
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
  // Defaults FALSE — an un-flagged request can never silently create a second
  // active quote. Today's UI sends no flag at all, so it fails safe until the
  // confirm step lands.
  const reissue = parsedBody.data?.reissue ?? false;

  return withIdempotency(
    req,
    'lead.proforma',
    `${id}:${auth.session.id}:${Math.floor(Date.now() / 10_000)}`,
    async () => {
      const lead = await findLead(id);
      if (!lead) return { status: 404, body: { error: 'not_found', message: 'سرنخ یافت نشد.' } };
      // Ownership-scoped like orders (W16): only the lead's assignee, or a
      // manager, may issue a customer-facing (SMS'd) proforma from it.
      if (!canActOnAssignedRecord(auth.session, lead.assigneeId)) {
        return {
          status: 403,
          body: { error: 'lead_forbidden', message: 'این سرنخ به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند پیش‌فاکتور صادر کند.' },
        };
      }

      const items = (await leadItemsOf(id)).map(toLineItem);
      const priced = items.filter((i) => i.unitPrice);
      if (priced.length === 0) {
        return {
          status: 409,
          body: { error: 'unpriced', message: 'هیچ قلم قیمت‌داری روی این سرنخ نیست.' },
        };
      }

      // Checked AFTER the unpriced guard so the UI never walks a rep through a
      // re-issue confirmation only to reject the issuance anyway. Read BEFORE
      // issuing: it both gates the re-issue and is the only chance to name the
      // quote issueProforma is about to void.
      const active = await activeProformaOfLead(id);
      if (active && !reissue) {
        return {
          status: 409,
          body: {
            error: 'proforma_active',
            message: `پیش‌فاکتور ${active.ref} برای این سرنخ فعال است (اعتبار تا ${formatJalali(active.validUntil)}). برای صدور نسخهٔ جدید، «صدور مجدد» را تأیید کنید؛ نسخهٔ فعلی باطل می‌شود.`,
            proforma: { ref: active.ref, total: active.total, validUntil: active.validUntil.toISOString() },
          },
        };
      }

      const proforma = await issueProforma(lead, priced, undefined, discountToman);
      // Pipeline moves on the DB write, not on the SMS — sendSms can burn
      // ~10s of timeouts and retries, and the lead/inbox state must not wait
      // on (or depend on) an external gateway.
      const { leadStatus, requestSynced } = await markLeadQuoted(lead);
      // The send outcome is REPORTED, never fatal: the proforma is durably
      // issued and viewable at /proforma/{ref}, so a dead SMS gateway must not
      // roll the rep's work back — it must just stop us claiming it landed.
      const sms = await sendNotification(
        lead.contactMobile,
        proformaSmsNotification(proforma.ref, lead.contactName, proforma.total, proforma.validUntil),
      );
      await audit(
        auth.session.id,
        'lead.proforma',
        { type: 'lead', id },
        { status: lead.status, activeProformaRef: active?.ref ?? null },
        {
          ref: proforma.ref,
          total: proforma.total,
          status: leadStatus,
          supersededRef: active?.ref ?? null,
          smsSent: sms.ok,
        },
      );
      return {
        status: 201,
        body: {
          proforma,
          smsSent: sms.ok,
          leadStatus,
          requestSynced,
          supersededRef: active?.ref ?? null,
        },
      };
    },
  );
}

export const POST = withApiErrorHandling(POSTImpl);
