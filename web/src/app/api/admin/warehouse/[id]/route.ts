import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { can } from '@/lib/auth/roles';
import {
  updateWarehouseItem,
  softDeleteWarehouseItem,
  UnsettledBalanceError,
  InvalidStatusTransitionError,
} from '@/lib/server/repos/ordersRepo';
import { finiteNumber } from '@/lib/validation/utils';

const payload = z
  .object({
    status: z.enum(['pending', 'stored', 'selling', 'released']).optional(),
    // W20: fractional now rejected (was `finiteNumber.min(0)`, no `.int()` —
    // passed validation but silently mismatched the bigint column).
    monthlyFeeToman: finiteNumber.min(0).max(1e9).int().optional(),
    quantityTons: finiteNumber.positive().max(100000).optional(),
    location: z.string().trim().max(120).nullable().optional(),
    contractRef: z.string().trim().max(120).nullable().optional(),
    insured: z.boolean().optional(),
    arrivedAt: z.string().datetime().nullable().optional(),
    movementNote: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'حداقل یک فیلد باید ارسال شود.' });

/** PATCH /api/admin/warehouse/{id} — status / fee / quantity / intake details.
 *
 *  `monthlyFeeToman` — the field that DETERMINES every future settlement's
 *  amount — requires `leads:manage` (W20), the same tier settling itself
 *  already requires; a `leads:write` rep could otherwise lower the rate,
 *  have a manager settle, then raise it back with nothing but two unlinked
 *  audit rows to show for it. Status/quantity/location stay at `leads:write`
 *  — day-to-day operator work. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  if (v.data.monthlyFeeToman !== undefined && !can(auth.session.role, 'leads:manage')) {
    return NextResponse.json(
      { error: 'fee_forbidden', message: 'تغییر هزینهٔ ماهانه فقط از عهدهٔ مدیر سیستم برمی‌آید.' },
      { status: 403 },
    );
  }

  const { movementNote, arrivedAt, ...patch } = v.data;
  let result;
  try {
    result = await updateWarehouseItem(
      id,
      { ...patch, arrivedAt: arrivedAt === undefined ? undefined : arrivedAt ? new Date(arrivedAt) : null },
      auth.session.id,
      movementNote,
    );
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ error: 'invalid_transition', message: 'وضعیت کالا را نمی‌توان به عقب برد.' }, { status: 409 });
    }
    throw err;
  }
  if (!result) return NextResponse.json({ error: 'not_found', message: 'کالا یافت نشد.' }, { status: 404 });

  await audit(
    auth.session.id,
    'warehouse.update',
    { type: 'warehouseItem', id },
    {
      status: result.before.status,
      monthlyFeeToman: result.before.monthlyFeeToman,
      quantityTons: result.before.quantityTons,
      location: result.before.location,
      contractRef: result.before.contractRef,
      insured: result.before.insured,
      arrivedAt: result.before.arrivedAt,
    },
    v.data,
  );
  return NextResponse.json({
    item: {
      id: result.after.id,
      ref: result.after.ref,
      product: result.after.product,
      sizeLabel: result.after.sizeLabel ?? undefined,
      quantityTons: result.after.quantityTons,
      monthlyFeeToman: result.after.monthlyFeeToman,
      storedAt: result.after.storedAt.toISOString(),
      arrivedAt: result.after.arrivedAt?.toISOString(),
      releasedAt: result.after.releasedAt?.toISOString(),
      location: result.after.location ?? undefined,
      contractRef: result.after.contractRef ?? undefined,
      insured: result.after.insured,
      status: result.after.status,
    },
  });
}

/** DELETE /api/admin/warehouse/{id}?force= — remove a mistakenly-created or
 *  duplicate entry from the working set without losing the record.
 *
 *  `leads:manage` (W20, matching the order-cancel/lead-archive precedent):
 *  this used to be `leads:write` with zero ownership check — any rep could
 *  erase any customer's inventory. Also refuses to run at all when the item
 *  still has an unsettled balance, UNLESS `?force=true` — a silent delete
 *  used to make a real, owed amount vanish with no trace. Query param, not a
 *  body: this client never sends one on DELETE (see lib/api/http.ts). */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const force = req.nextUrl.searchParams.get('force') === 'true';

  let row;
  try {
    row = await softDeleteWarehouseItem(id, { force });
  } catch (err) {
    if (err instanceof UnsettledBalanceError) {
      return NextResponse.json(
        { error: 'unsettled_balance', message: err.message, amountToman: err.amountToman },
        { status: 409 },
      );
    }
    throw err;
  }
  if (!row) return NextResponse.json({ error: 'not_found', message: 'کالا یافت نشد.' }, { status: 404 });

  await audit(auth.session.id, 'warehouse.delete', { type: 'warehouseItem', id }, {
    ref: row.ref,
    userId: row.userId,
    product: row.product,
    quantityTons: row.quantityTons,
    monthlyFeeToman: row.monthlyFeeToman,
    status: row.status,
    forced: force,
  }, null);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
