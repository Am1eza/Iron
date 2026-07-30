/**
 * Consignment-warehouse fee settlements (US-08.5, hardened in W20) — a real
 * billing record, not just a point-in-time report: each settlement freezes
 * the period it covers and the item's quantity/fee snapshot, and the NEXT
 * settlement's period starts from this one's `periodTo`, not from the item's
 * `arrivedAt`/`storedAt` again.
 *
 * Billing formula (W20 — owner's explicit call): monthlyFeeToman is a RATE
 * per ton, not a flat per-item fee — amount = monthlyFeeToman × quantityTons
 * × (days / 30). Two clocks bound the period:
 *  - it never starts before the goods physically arrived (`arrivedAt`, falling
 *    back to `storedAt` for pre-W20 rows that never got one) — and a
 *    'pending' item (not yet physically received) accrues nothing at all;
 *  - it never runs past the moment custody actually ended (`releasedAt`,
 *    stamped once by updateWarehouseItem on the transition into 'released').
 * A caller-supplied `periodTo` is clamped to that same stop-clock — it can
 * shorten a settlement, never extend one past what has genuinely accrued.
 *
 * If quantityTons/monthlyFeeToman change mid-period (updateWarehouseItem),
 * the whole unsettled period is still priced at the CURRENT snapshot, not
 * split into sub-periods at the old/new rate — a documented v1
 * simplification. For exact accuracy across a rate change, settle before
 * changing the rate.
 *
 * Mistakes are corrected with a REVERSING entry, never an edit or delete —
 * see voidSettlement(). lastSettlementFor() skips voided settlements and
 * reversing entries when anchoring the next period, so voiding a settlement
 * genuinely reopens that period for real billing again.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { warehouseItems, warehouseSettlements, users } from '@/lib/server/db/schema';

export type WarehouseSettlementRow = typeof warehouseSettlements.$inferSelect;
type WarehouseItemForBilling = Pick<
  typeof warehouseItems.$inferSelect,
  'id' | 'storedAt' | 'arrivedAt' | 'releasedAt' | 'status' | 'quantityTons' | 'monthlyFeeToman'
>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UnsettledSummary {
  warehouseItemId: string;
  periodFrom: string; // ISO
  periodTo: string; // ISO — "as of" instant this was computed (clamped to the stop-clock)
  days: number;
  quantityTons: number;
  monthlyFeeToman: number;
  amountToman: number;
}

/** The most recent REAL settlement for one item — never a voided one, and
 *  never a reversing entry itself, so voiding fully reopens the period it
 *  covered for billing. Accepts an optional tx (DbOrTx) so createSettlement
 *  can call it INSIDE the transaction that locks the item row. */
export async function lastSettlementFor(
  warehouseItemId: string,
  dbh: DbOrTx = getDb(),
): Promise<WarehouseSettlementRow | null> {
  const rows = await dbh
    .select()
    .from(warehouseSettlements)
    .where(
      and(
        eq(warehouseSettlements.warehouseItemId, warehouseItemId),
        isNull(warehouseSettlements.voidedAt),
        isNull(warehouseSettlements.voidsSettlementId),
      ),
    )
    .orderBy(desc(warehouseSettlements.periodTo))
    .limit(1);
  return rows[0] ?? null;
}

/** The instant billing must stop counting for this item — custody ended
 *  (`releasedAt`) if it ever will, otherwise "now". Shared by the read path
 *  (unsettledFor) and the write path (createSettlement) so what an operator
 *  sees before settling is exactly what gets frozen. */
function stopClock(item: Pick<WarehouseItemForBilling, 'releasedAt'>, now: Date): Date {
  return item.releasedAt && item.releasedAt.getTime() < now.getTime() ? item.releasedAt : now;
}

/** What's owed for this item RIGHT NOW, from its last settlement (or
 *  physical arrival if never settled) through the stop-clock. Read-only —
 *  does not create a settlement row. A 'pending' item (not yet physically
 *  received) always reads zero: nothing has started accruing yet. */
export async function unsettledFor(item: WarehouseItemForBilling): Promise<UnsettledSummary> {
  const now = new Date();
  if (item.status === 'pending') {
    return {
      warehouseItemId: item.id,
      periodFrom: now.toISOString(),
      periodTo: now.toISOString(),
      days: 0,
      quantityTons: item.quantityTons,
      monthlyFeeToman: item.monthlyFeeToman,
      amountToman: 0,
    };
  }
  const last = await lastSettlementFor(item.id);
  const periodFrom = last ? last.periodTo : (item.arrivedAt ?? item.storedAt);
  const periodTo = stopClock(item, now);
  const days = Math.max(0, (periodTo.getTime() - periodFrom.getTime()) / MS_PER_DAY);
  const amountToman = Math.round(item.monthlyFeeToman * item.quantityTons * (days / 30));
  return {
    warehouseItemId: item.id,
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
    days: Math.round(days * 100) / 100,
    quantityTons: item.quantityTons,
    monthlyFeeToman: item.monthlyFeeToman,
    amountToman,
  };
}

export class NothingToSettleError extends Error {}
export class ItemPendingError extends Error {}

/** Records a settlement: snapshots the item's current qty/fee, computes the
 *  amount for [last settlement's periodTo (or arrival), periodTo], and
 *  inserts the row. Returns null if the item doesn't exist (same not-found
 *  convention as updateOrderShipping/updateWarehouseItem elsewhere in this
 *  repo). Throws ItemPendingError if the item hasn't physically arrived yet,
 *  and NothingToSettleError if the requested periodTo (after clamping to the
 *  stop-clock) isn't strictly after the period start — e.g. settling twice in
 *  the same instant, or a caller-supplied periodTo that's already covered. */
export async function createSettlement(
  warehouseItemId: string,
  actorId: string | null,
  opts: { periodTo?: Date; note?: string } = {},
): Promise<WarehouseSettlementRow | null> {
  // Read-last-settlement-then-insert used to run as two unguarded queries: two
  // concurrent settle requests for the same item could both read the same
  // "last settlement" and both insert a row covering the identical period —
  // a real double-bill, not a hypothetical one. The whole read+insert now
  // runs in one transaction with the item row LOCKED (`for('update')`) for
  // its duration, so a second concurrent call blocks until the first commits
  // and then sees its settlement as the new `last` — the same period can
  // never be settled twice.
  return getDb().transaction(async (tx) => {
    const itemRows = await tx
      .select()
      .from(warehouseItems)
      .where(and(eq(warehouseItems.id, warehouseItemId), isNull(warehouseItems.deletedAt)))
      .for('update')
      .limit(1);
    const item = itemRows[0];
    if (!item) return null;
    if (item.status === 'pending') {
      throw new ItemPendingError('کالایی که هنوز فیزیکی تحویل نشده قابل تسویه نیست.');
    }

    const last = await lastSettlementFor(warehouseItemId, tx);
    const periodFrom = last ? last.periodTo : (item.arrivedAt ?? item.storedAt);
    const now = new Date();
    // Clamp: a caller-supplied periodTo can shorten the settlement window,
    // never extend it past the real stop-clock — this is what closes the
    // "settle months that haven't happened yet" hole.
    const clock = stopClock(item, now);
    const periodTo = opts.periodTo && opts.periodTo.getTime() < clock.getTime() ? opts.periodTo : clock;
    if (periodTo.getTime() <= periodFrom.getTime()) {
      throw new NothingToSettleError('periodTo must be strictly after the current unsettled period start');
    }
    const days = (periodTo.getTime() - periodFrom.getTime()) / MS_PER_DAY;
    const amountToman = Math.round(item.monthlyFeeToman * item.quantityTons * (days / 30));

    const rows = await tx
      .insert(warehouseSettlements)
      .values({
        id: ulid(),
        warehouseItemId,
        userId: item.userId,
        periodFrom,
        periodTo,
        quantityTons: item.quantityTons,
        monthlyFeeToman: item.monthlyFeeToman,
        amountToman,
        note: opts.note ?? null,
        actorId,
      })
      .returning();
    return rows[0]!;
  });
}

export class AlreadyVoidedError extends Error {}

/** Corrects a wrong settlement WITHOUT rewriting accounting history: marks
 *  the original `voidedAt` and inserts a negative-amount reversing row
 *  pointing back at it. lastSettlementFor() then skips both, so the period
 *  the original covered becomes billable again on the next real settlement —
 *  this is the "void/correction path" the audit found completely missing. */
export async function voidSettlement(
  settlementId: string,
  actorId: string | null,
  reason?: string,
): Promise<{ voided: WarehouseSettlementRow; reversal: WarehouseSettlementRow } | null> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(warehouseSettlements)
      .where(eq(warehouseSettlements.id, settlementId))
      .for('update')
      .limit(1);
    const original = rows[0];
    if (!original) return null;
    if (original.voidedAt) throw new AlreadyVoidedError('این تسویه قبلاً باطل شده است.');
    if (original.voidsSettlementId) throw new AlreadyVoidedError('یک سطرِ اصلاحی را نمی‌توان باطل کرد.');

    const voidedRows = await tx
      .update(warehouseSettlements)
      .set({ voidedAt: new Date() })
      .where(eq(warehouseSettlements.id, settlementId))
      .returning();

    const reversalRows = await tx
      .insert(warehouseSettlements)
      .values({
        id: ulid(),
        warehouseItemId: original.warehouseItemId,
        userId: original.userId,
        periodFrom: original.periodFrom,
        periodTo: original.periodTo,
        quantityTons: original.quantityTons,
        monthlyFeeToman: original.monthlyFeeToman,
        amountToman: -original.amountToman,
        note: reason ?? `ابطال تسویهٔ ${original.id}`,
        actorId,
        voidsSettlementId: original.id,
      })
      .returning();

    return { voided: voidedRows[0]!, reversal: reversalRows[0]! };
  });
}

/** Manual payment tracking (W20) — no gateway integration, just a record that
 *  the money for this settlement actually came in. Guards against marking a
 *  VOIDED original or a REVERSING entry itself "paid" (review finding — the
 *  UI already hides this, but a direct API call must not be able to produce
 *  misleading bookkeeping either). */
export async function markSettlementPaid(
  settlementId: string,
  note?: string,
): Promise<WarehouseSettlementRow | null> {
  const rows = await getDb()
    .update(warehouseSettlements)
    .set({ paidAt: new Date(), paymentNote: note ?? null })
    .where(
      and(
        eq(warehouseSettlements.id, settlementId),
        isNull(warehouseSettlements.paidAt),
        isNull(warehouseSettlements.voidedAt),
        isNull(warehouseSettlements.voidsSettlementId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function settlementsForUser(userId: string): Promise<WarehouseSettlementRow[]> {
  return getDb()
    .select()
    .from(warehouseSettlements)
    .where(eq(warehouseSettlements.userId, userId))
    .orderBy(desc(warehouseSettlements.periodTo));
}

export interface CustomerSettlementOverview {
  userId: string;
  name: string | null;
  mobile: string;
  activeItemCount: number;
  totalUnsettledToman: number;
}

/** One row per customer with at least one active (non-deleted) warehouse
 *  item, plus their total currently-unsettled amount across all of them —
 *  the admin's "who do I need to settle with" starting point. In-memory
 *  aggregation over adminListWarehouse's rows rather than a SQL GROUP BY:
 *  the number of consignment customers is small, and the per-item unsettled
 *  calc already needs one query per item's last settlement either way. */
export async function customerSettlementOverview(): Promise<CustomerSettlementOverview[]> {
  const db = getDb();
  const items = await db
    .select({ item: warehouseItems, name: users.name, mobile: users.mobile })
    .from(warehouseItems)
    .innerJoin(users, eq(warehouseItems.userId, users.id))
    .where(isNull(warehouseItems.deletedAt));

  const byUser = new Map<string, CustomerSettlementOverview>();
  for (const row of items) {
    const summary = await unsettledFor(row.item);
    const existing = byUser.get(row.item.userId);
    if (existing) {
      existing.activeItemCount += 1;
      existing.totalUnsettledToman += summary.amountToman;
    } else {
      byUser.set(row.item.userId, {
        userId: row.item.userId,
        name: row.name,
        mobile: row.mobile,
        activeItemCount: 1,
        totalUnsettledToman: summary.amountToman,
      });
    }
  }
  return [...byUser.values()].sort((a, b) => b.totalUnsettledToman - a.totalUnsettledToman);
}
