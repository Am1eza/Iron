import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { warehouseForUser } from '@/lib/server/repos/ordersRepo';
import { userById } from '@/lib/auth/store';
import {
  unsettledFor,
  settlementsForUser,
  createSettlement,
  NothingToSettleError,
} from '@/lib/server/repos/warehouseSettlementsRepo';

/** GET /api/admin/warehouse/settlements?userId= — one customer's
 *  consignment-fee profile: every active item's currently-unsettled amount
 *  (computed live, no row written) plus their settlement history (US-08.5). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'validation', message: 'userId لازم است.' }, { status: 400 });
  const user = await userById(userId);
  if (!user) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });

  // No status filter: a 'released' item can still have an unsettled final
  // stretch owed — it stops accruing NEW fees on its own, but that's a
  // product decision for later, not something to silently hide here.
  const [items, history] = await Promise.all([warehouseForUser(userId), settlementsForUser(userId)]);
  const unsettled = await Promise.all(
    items.map((i) =>
      unsettledFor({ id: i.id, storedAt: new Date(i.storedAt), quantityTons: i.quantityTons, monthlyFeeToman: i.monthlyFeeToman }),
    ),
  );

  return NextResponse.json(
    { user: { id: user.id, name: user.name, mobile: user.mobile }, unsettled, history },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const payload = z.object({
  warehouseItemId: z.string().min(1),
  periodTo: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional(),
});

/** POST /api/admin/warehouse/settlements — record a settlement for one
 *  warehouse item (US-08.5): snapshots current qty/fee, computes the amount
 *  owed since the last settlement (or since storedAt if never settled), and
 *  freezes it as a permanent billing record. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  let settlement;
  try {
    settlement = await createSettlement(v.data.warehouseItemId, auth.session.id, {
      periodTo: v.data.periodTo ? new Date(v.data.periodTo) : undefined,
      note: v.data.note,
    });
  } catch (err) {
    if (err instanceof NothingToSettleError) {
      return NextResponse.json(
        { error: 'nothing_to_settle', message: 'برای این بازه چیزی برای تسویه وجود ندارد.' },
        { status: 409 },
      );
    }
    throw err;
  }
  if (!settlement) return NextResponse.json({ error: 'not_found', message: 'قلم انبار یافت نشد.' }, { status: 404 });

  await audit(auth.session.id, 'warehouse.settle', { type: 'warehouseSettlement', id: settlement.id }, null, {
    warehouseItemId: settlement.warehouseItemId,
    amountToman: settlement.amountToman,
    periodFrom: settlement.periodFrom,
    periodTo: settlement.periodTo,
  });
  return NextResponse.json({ settlement }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
