/**
 * Consignment-warehouse fee settlements (US-08.5) — a real billing record,
 * not just a point-in-time report: each settlement freezes the period it
 * covers and the item's quantity/fee snapshot, and the NEXT settlement's
 * period starts from this one's `periodTo`, not from the item's `storedAt`
 * again. Accrual is simple pro-rata (monthlyFeeToman × days/30) — a
 * documented v1 simplification: if quantityTons/monthlyFeeToman change
 * mid-period (updateWarehouseItem), the whole unsettled period is priced at
 * the CURRENT snapshot, not split into sub-periods at the old/new rate. For
 * exact accuracy across a rate change, settle before changing the rate.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { warehouseItems, warehouseSettlements, users } from '@/lib/server/db/schema';

export type WarehouseSettlementRow = typeof warehouseSettlements.$inferSelect;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UnsettledSummary {
  warehouseItemId: string;
  periodFrom: string; // ISO
  periodTo: string; // ISO — "as of" instant this was computed
  days: number;
  quantityTons: number;
  monthlyFeeToman: number;
  amountToman: number;
}

/** The most recent settlement for one item, or null if never settled. */
export async function lastSettlementFor(warehouseItemId: string): Promise<WarehouseSettlementRow | null> {
  const rows = await getDb()
    .select()
    .from(warehouseSettlements)
    .where(eq(warehouseSettlements.warehouseItemId, warehouseItemId))
    .orderBy(desc(warehouseSettlements.periodTo))
    .limit(1);
  return rows[0] ?? null;
}

/** What's owed for this item RIGHT NOW, from its last settlement (or
 *  `storedAt` if never settled) through the current instant. Read-only —
 *  does not create a settlement row. */
export async function unsettledFor(
  item: Pick<typeof warehouseItems.$inferSelect, 'id' | 'storedAt' | 'quantityTons' | 'monthlyFeeToman'>,
): Promise<UnsettledSummary> {
  const last = await lastSettlementFor(item.id);
  const periodFrom = last ? last.periodTo : item.storedAt;
  const periodTo = new Date();
  const days = Math.max(0, (periodTo.getTime() - periodFrom.getTime()) / MS_PER_DAY);
  const amountToman = Math.round(item.monthlyFeeToman * (days / 30));
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

/** Records a settlement: snapshots the item's current qty/fee, computes the
 *  amount for [last settlement's periodTo (or storedAt), periodTo], and
 *  inserts the row. Returns null if the item doesn't exist (same not-found
 *  convention as updateOrderShipping/updateWarehouseItem elsewhere in this
 *  repo). Throws NothingToSettleError if periodTo isn't strictly after the
 *  period start (e.g. settling twice in the same instant, or a
 *  caller-supplied periodTo in the past) — that's a real validation failure,
 *  not a "doesn't exist" case, so it stays a throw. */
export async function createSettlement(
  warehouseItemId: string,
  actorId: string | null,
  opts: { periodTo?: Date; note?: string } = {},
): Promise<WarehouseSettlementRow | null> {
  const db = getDb();
  const itemRows = await db
    .select()
    .from(warehouseItems)
    .where(and(eq(warehouseItems.id, warehouseItemId), isNull(warehouseItems.deletedAt)))
    .limit(1);
  const item = itemRows[0];
  if (!item) return null;

  const last = await lastSettlementFor(warehouseItemId);
  const periodFrom = last ? last.periodTo : item.storedAt;
  const periodTo = opts.periodTo ?? new Date();
  if (periodTo.getTime() <= periodFrom.getTime()) {
    throw new NothingToSettleError('periodTo must be strictly after the current unsettled period start');
  }
  const days = (periodTo.getTime() - periodFrom.getTime()) / MS_PER_DAY;
  const amountToman = Math.round(item.monthlyFeeToman * (days / 30));

  const rows = await db
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
