import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { cancelProforma } from '@/lib/server/repos/leadsRepo';

/** DELETE /api/admin/proforma/{ref} — void an issued پیش‌فاکتور (customer
 *  changed the order, a pricing error, etc.). Distinct from the automatic
 *  time-based expiry the sweep job applies; only cancels from 'active'. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { ref } = await ctx.params;
  const proforma = await cancelProforma(decodeURIComponent(ref));
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
