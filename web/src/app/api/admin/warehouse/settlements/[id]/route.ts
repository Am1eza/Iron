import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import {
  voidSettlement,
  markSettlementPaid,
  AlreadyVoidedError,
  NotLatestSettlementError,
} from '@/lib/server/repos/warehouseSettlementsRepo';

const payload = z.discriminatedUnion('action', [
  z.object({ action: z.literal('void'), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('paid'), note: z.string().trim().max(500).optional() }),
]);

/** PATCH /api/admin/warehouse/settlements/{id} — the correction path the W20
 *  audit found completely missing: `leads:manage` because both actions touch
 *  a permanent billing record.
 *
 *  action='void' inserts a reversing entry rather than editing/deleting the
 *  original (see voidSettlement's doc comment) — an accounting record stays
 *  accountable even when it was wrong.
 *  action='paid' is manual bookkeeping only, no payment gateway involved. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  if (v.data.action === 'void') {
    let result;
    try {
      result = await voidSettlement(id, auth.session.id, v.data.reason);
    } catch (err) {
      if (err instanceof AlreadyVoidedError) {
        return NextResponse.json({ error: 'already_voided', message: err.message }, { status: 409 });
      }
      if (err instanceof NotLatestSettlementError) {
        return NextResponse.json({ error: 'not_latest_settlement', message: err.message }, { status: 409 });
      }
      throw err;
    }
    if (!result) return NextResponse.json({ error: 'not_found', message: 'تسویه یافت نشد.' }, { status: 404 });
    await audit(auth.session.id, 'warehouse.settle_void', { type: 'warehouseSettlement', id }, {
      amountToman: result.voided.amountToman,
    }, {
      reversalId: result.reversal.id,
      reason: v.data.reason ?? null,
    });
    return NextResponse.json({ voided: result.voided, reversal: result.reversal });
  }

  const settlement = await markSettlementPaid(id, v.data.note);
  if (!settlement) return NextResponse.json({ error: 'not_found', message: 'تسویه یافت نشد یا قبلاً پرداخت‌شده ثبت شده.' }, { status: 404 });
  await audit(auth.session.id, 'warehouse.settle_paid', { type: 'warehouseSettlement', id }, null, {
    paidAt: settlement.paidAt,
    note: v.data.note ?? null,
  });
  return NextResponse.json({ settlement });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
