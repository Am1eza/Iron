import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { finiteNumber } from '@/lib/validation/utils';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateLeadItem, findLead, LeadItemLockedError, WholeUnitQtyError } from '@/lib/server/repos/leadsRepo';
import { canActOnAssignedRecord } from '@/lib/auth/roles';
import type { PriceUnit } from '@/lib/types/domain';

/** Business ceilings, not type limits. The old schema was `positive()` /
 *  `nonnegative()` with no upper bound at all, so a fat-fingered
 *  ۴٬۲۰۰٬۰۰۰٬۰۰۰ تومان unit price was accepted, multiplied into `lineTotal`
 *  and frozen onto a proforma that was then SMS'd to the customer. A million
 *  kg is ۱۰۰۰ تن on a single line and no per-unit steel price reaches a
 *  milliard Toman — both are an order of magnitude past any real deal. */
const QTY_MAX = 1_000_000;
const UNIT_PRICE_MAX = 1_000_000_000;

const UNIT_LABEL: Record<PriceUnit, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
};

const payload = z
  .object({
    qty: finiteNumber
      .positive({ message: 'مقدار باید بزرگ‌تر از صفر باشد.' })
      .max(QTY_MAX, { message: 'مقدار وارد‌شده بیش از حد مجاز است.' })
      .optional(),
    // `null`, not 0, is how "no price" is sent. Storing 0 for a cleared price
    // box made lineTotal 0 and the proforma route's `filter(i => i.unitPrice)`
    // (0 is falsy) then dropped the whole line out of the customer's quote
    // without a word — so 0 is rejected outright rather than quietly meaning
    // two different things.
    unitPrice: finiteNumber
      .int({ message: 'قیمت واحد باید عدد صحیح (تومان) باشد.' })
      .min(1, { message: 'قیمت واحد نمی‌تواند صفر باشد؛ برای «بدون قیمت» فیلد قیمت را خالی بگذارید.' })
      .max(UNIT_PRICE_MAX, { message: 'قیمت واحد وارد‌شده بیش از حد مجاز است.' })
      .nullable()
      .optional(),
  })
  .refine((v) => v.qty !== undefined || v.unitPrice !== undefined, { message: 'حداقل یک فیلد باید ارسال شود.' });

/** PATCH /api/admin/leads/{id}/items/{itemId} — adjust qty/unitPrice on a
 *  lead's line item (US-19.4). `lineTotal` is always recomputed server-side
 *  (see updateLeadItem), never accepted directly from the client, and the
 *  edit is refused once an active proforma has frozen these lines: the quote
 *  in the customer's hand and the lead must not be allowed to drift apart. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id, itemId } = await ctx.params;

  // Ownership-scoped like the proforma/order routes that consume this same
  // lead (W16): only the lead's assignee, or a manager, may alter money on
  // its items — a `leads:write`-only colleague gets a clear 403 instead of
  // silently being able to change qty/unitPrice on anyone's lead.
  const lead = await findLead(id);
  if (!lead) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  if (!canActOnAssignedRecord(auth.session, lead.assigneeId)) {
    return NextResponse.json(
      { error: 'lead_forbidden', message: 'این سرنخ به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند اقلام آن را تغییر دهد.' },
      { status: 403 },
    );
  }

  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  let updated;
  try {
    updated = await updateLeadItem(itemId, id, v.data);
  } catch (err) {
    if (err instanceof LeadItemLockedError) {
      return NextResponse.json(
        {
          error: 'proforma_issued',
          message: `پیش‌فاکتور ${err.proformaRef} برای این سرنخ صادر شده و اقلام آن قفل است. برای تغییر مقدار یا قیمت، ابتدا پیش‌فاکتور را ابطال و سپس دوباره صادر کنید.`,
          proformaRef: err.proformaRef,
        },
        { status: 409 },
      );
    }
    if (err instanceof WholeUnitQtyError) {
      const message = `مقدار برای واحد «${UNIT_LABEL[err.unit]}» باید عدد صحیح باشد.`;
      return NextResponse.json({ error: 'validation', message, fields: { qty: message } }, { status: 400 });
    }
    throw err;
  }
  if (!updated) return NextResponse.json({ error: 'not_found', message: 'قلم سرنخ یافت نشد.' }, { status: 404 });

  // before/leadRef are audit metadata, not part of the item resource.
  const { before, leadRef, ...item } = updated;
  // The before-state was a literal `null` — an audit row about a MONEY field
  // that could not answer "what was the price before?". Both sides now also
  // carry the lead id/ref, so the trail names the deal instead of forcing a
  // lookup back from a bare item id.
  await audit(
    auth.session.id,
    'lead.item_update',
    { type: 'lead_item', id: itemId },
    { leadId: id, leadRef, name: before.name, qty: before.qty, unitPrice: before.unitPrice, lineTotal: before.lineTotal },
    { leadId: id, leadRef, name: item.name, qty: item.qty, unitPrice: item.unitPrice, lineTotal: item.lineTotal },
  );
  return NextResponse.json({ item });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
