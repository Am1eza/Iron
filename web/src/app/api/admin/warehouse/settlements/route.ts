import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { warehouseForUser } from '@/lib/server/repos/ordersRepo';
import {
  unsettledForMany,
  settlementsPageForUser,
  createSettlement,
  NothingToSettleError,
  ItemPendingError,
} from '@/lib/server/repos/warehouseSettlementsRepo';
import { getDb } from '@/lib/server/db/client';
import { warehouseItems } from '@/lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

/** GET /api/admin/warehouse/settlements?userId= — one customer's
 *  consignment-fee profile: every active item's currently-unsettled amount
 *  (computed live, no row written) plus their settlement history (US-08.5).
 *
 *  W20: used to resolve ANY user id to {name, mobile} via a free `userById`
 *  lookup, gated only at `leads:read` — a way to read a colleague's or a
 *  stranger's identity through a side door that bypassed `users:manage`.
 *  Now derives identity from the customer's OWN warehouse rows: if they have
 *  none, this 404s exactly like a genuinely unknown id, revealing nothing. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'validation', message: 'userId لازم است.' }, { status: 400 });

  // No status filter: a 'released' item can still have an unsettled final
  // stretch owed — it stops accruing NEW fees on its own (the stop-clock),
  // but that final stretch still needs settling, so it stays in this list.
  // settlementsPageForUser, NOT settlementsForUser: this screen wants pages,
  // but that function is shared with the customer's personal-data export
  // (GET /api/me/export), which must stay complete. See both docstrings.
  const p = req.nextUrl.searchParams;
  const historyPage = Math.max(1, Number(p.get('historyPage') ?? 1) || 1);
  const [items, history] = await Promise.all([
    warehouseForUser(userId),
    settlementsPageForUser(userId, historyPage),
  ]);
  if (items.length === 0 && history.total === 0) {
    return NextResponse.json({ error: 'not_found', message: 'کاربر یا سابقهٔ انباری یافت نشد.' }, { status: 404 });
  }
  const { users } = await import('@/lib/server/db/schema');
  const userRows = await getDb().select({ id: users.id, name: users.name, mobile: users.mobile }).from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });

  const rawItems = await getDb()
    .select()
    .from(warehouseItems)
    .where(and(eq(warehouseItems.userId, userId), isNull(warehouseItems.deletedAt)));
  const unsettled = await unsettledForMany(rawItems);

  // Additive shape: `history` stays a plain array, so every existing reader
  // of it keeps working; the paging facts ride alongside it.
  return NextResponse.json(
    {
      user,
      unsettled,
      history: history.rows,
      historyTotal: history.total,
      historyPage: history.page,
      historyPerPage: history.perPage,
    },
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
 *  owed since the last settlement (or since physical arrival if never
 *  settled) up to the stop-clock, and freezes it as a permanent billing
 *  record.
 *
 *  `leads:manage` (W17): this mints a real, permanent billing record with no
 *  way to un-issue it (see voidSettlement for the correction path) — the
 *  same "financial/destructive action" tier as cancelling an order or
 *  archiving a lead, not day-to-day `leads:write`. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage');
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
    if (err instanceof ItemPendingError) {
      return NextResponse.json({ error: 'item_pending', message: err.message }, { status: 409 });
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
