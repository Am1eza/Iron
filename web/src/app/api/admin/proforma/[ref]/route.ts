import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { cancelProforma, findProformaByRef, findLead } from '@/lib/server/repos/leadsRepo';
import { canActOnAssignedRecord } from '@/lib/auth/roles';

/** DELETE /api/admin/proforma/{ref} — void an issued پیش‌فاکتور (customer
 *  changed the order, a pricing error, etc.). Distinct from the automatic
 *  time-based expiry the sweep job applies; only cancels from 'active'.
 *  Ownership-scoped like the lead it belongs to (W16): only that lead's
 *  assignee, or a manager, may void a customer-facing proforma — checked
 *  BEFORE cancelling, since this is destructive (the ref goes 'cancelled'
 *  and can't be un-cancelled). */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;
  // `cancelProforma`'s WHERE is an exact, case-sensitive match against a ref
  // stored uppercase — normalize once, up front, and reuse the SAME value
  // for both the lookup and the cancel so they can never disagree.
  const decodedRef = decodeURIComponent(ref).toUpperCase();

  const existing = await findProformaByRef(decodedRef);
  if (!existing || existing.status !== 'active') {
    return NextResponse.json(
      { error: 'not_found', message: 'پیش‌فاکتور یافت نشد یا فعال نیست.' },
      { status: 404 },
    );
  }
  const lead = await findLead(existing.leadId);
  if (!canActOnAssignedRecord(auth.session, lead?.assigneeId ?? null)) {
    return NextResponse.json(
      { error: 'lead_forbidden', message: 'این پیش‌فاکتور به سرنخی تعلق دارد که به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند آن را باطل کند.' },
      { status: 403 },
    );
  }

  const proforma = await cancelProforma(decodedRef);
  if (!proforma) {
    return NextResponse.json(
      { error: 'not_found', message: 'پیش‌فاکتور یافت نشد یا فعال نیست.' },
      { status: 404 },
    );
  }
  await audit(auth.session.id, 'proforma.cancel', { type: 'proforma', id: proforma.ref }, null, null);
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiErrorHandling(DELETEImpl);
