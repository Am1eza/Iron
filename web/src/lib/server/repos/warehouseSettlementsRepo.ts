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
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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

/** lastSettlementFor for a whole set of items, in ONE query.
 *
 *  The customer settlement screen used to call lastSettlementFor per item
 *  inside an unbounded Promise.all — every item a customer has ever stored
 *  became a concurrent query against a 10-connection pool, so a large enough
 *  customer did not merely render slowly, it starved the pool and stalled
 *  unrelated requests on the same worker.
 *
 *  DISTINCT ON (warehouse_item_id) ... ORDER BY warehouse_item_id, period_to
 *  DESC is the Postgres idiom for "latest row per group" and applies exactly
 *  the same voided/reversing filters as the single-item version. */
export async function lastSettlementForMany(
  warehouseItemIds: readonly string[],
  dbh: DbOrTx = getDb(),
): Promise<Map<string, WarehouseSettlementRow>> {
  if (warehouseItemIds.length === 0) return new Map();
  const rows = await dbh
    .selectDistinctOn([warehouseSettlements.warehouseItemId])
    .from(warehouseSettlements)
    .where(
      and(
        inArray(warehouseSettlements.warehouseItemId, [...warehouseItemIds]),
        isNull(warehouseSettlements.voidedAt),
        isNull(warehouseSettlements.voidsSettlementId),
      ),
    )
    .orderBy(warehouseSettlements.warehouseItemId, desc(warehouseSettlements.periodTo));
  return new Map(rows.map((r) => [r.warehouseItemId, r]));
}

/** The instant billing must stop counting for this item — custody ended
 *  (`releasedAt`) if it ever will, otherwise "now". Shared by the read path
 *  (unsettledFor) and the write path (createSettlement) so what an operator
 *  sees before settling is exactly what gets frozen. */
function stopClock(item: Pick<WarehouseItemForBilling, 'releasedAt'>, now: Date): Date {
  return item.releasedAt && item.releasedAt.getTime() < now.getTime() ? item.releasedAt : now;
}

/** The billing arithmetic, with the last settlement already resolved. Pure —
 *  the single-item and batched read paths both go through here so they can
 *  never drift into quoting a customer two different amounts. */
function summarizeUnsettled(
  item: WarehouseItemForBilling,
  last: WarehouseSettlementRow | null,
  now: Date,
): UnsettledSummary {
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

/** What's owed for this item RIGHT NOW, from its last settlement (or
 *  physical arrival if never settled) through the stop-clock. Read-only —
 *  does not create a settlement row. A 'pending' item (not yet physically
 *  received) always reads zero: nothing has started accruing yet. */
export async function unsettledFor(item: WarehouseItemForBilling): Promise<UnsettledSummary> {
  const now = new Date();
  if (item.status === 'pending') return summarizeUnsettled(item, null, now);
  return summarizeUnsettled(item, await lastSettlementFor(item.id), now);
}

/** unsettledFor across many items with ONE settlement query instead of one
 *  per item. Also evaluates every item against a SINGLE `now`, so a slow page
 *  can no longer hand back rows whose periods end at slightly different
 *  instants. */
export async function unsettledForMany(
  items: readonly WarehouseItemForBilling[],
): Promise<UnsettledSummary[]> {
  const now = new Date();
  const billableIds = items.filter((i) => i.status !== 'pending').map((i) => i.id);
  const lastByItem = await lastSettlementForMany(billableIds);
  return items.map((item) => summarizeUnsettled(item, lastByItem.get(item.id) ?? null, now));
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

/** audit-2026-08-08: `lastSettlementFor` anchors the next period off
 *  whichever NON-VOIDED row has the latest `periodTo` — it has no notion of
 *  an "interior gap." Voiding anything OTHER than an item's current latest
 *  settlement leaves the very next settlement anchored at the same later
 *  `periodTo` it already was, silently and permanently dropping the voided
 *  row's period from all future billing. `voidSettlement` refuses this case
 *  rather than quietly losing revenue — see the error's own message. */
export class NotLatestSettlementError extends Error {}

/** Corrects a wrong settlement WITHOUT rewriting accounting history: marks
 *  the original `voidedAt` and inserts a negative-amount reversing row
 *  pointing back at it. lastSettlementFor() then skips both, so the period
 *  the original covered becomes billable again on the next real settlement —
 *  this is the "void/correction path" the audit found completely missing.
 *
 *  Restricted to the item's CURRENT LATEST settlement (see
 *  NotLatestSettlementError) — voiding an older one can't reopen its period
 *  for rebilling, only pretend to. */
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

    // Row-locked (same transaction, same FOR UPDATE guarantee as `original`
    // itself) so a concurrent createSettlement can't slip a newer row in
    // between this check and the update below.
    const newer = await tx
      .select({ id: warehouseSettlements.id })
      .from(warehouseSettlements)
      .where(
        and(
          eq(warehouseSettlements.warehouseItemId, original.warehouseItemId),
          isNull(warehouseSettlements.voidedAt),
          isNull(warehouseSettlements.voidsSettlementId),
          sql`${warehouseSettlements.id} != ${original.id}`,
          sql`${warehouseSettlements.periodTo} >= ${original.periodTo}`,
        ),
      )
      .limit(1);
    if (newer.length > 0) {
      throw new NotLatestSettlementError(
        'فقط آخرین تسویهٔ این قلم قابل ابطال است — تسویه‌های جدیدتری بعد از این ثبت شده‌اند.',
      );
    }

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

/** A customer's COMPLETE settlement ledger — deliberately unpaged, and it
 *  must stay that way. Its callers are the ones that need all of it:
 *  GET /api/me/export (the customer's personal-data export, which is a legal
 *  obligation and would be quietly falsified by a LIMIT) and
 *  GET /api/me/warehouse/settlements. The admin screen, which does want
 *  pages, uses settlementsPageForUser below instead. */
export async function settlementsForUser(userId: string): Promise<WarehouseSettlementRow[]> {
  return getDb()
    .select()
    .from(warehouseSettlements)
    .where(eq(warehouseSettlements.userId, userId))
    .orderBy(desc(warehouseSettlements.periodTo));
}

/** One page of a customer's settlement ledger, for the admin screen — a
 *  SIBLING of settlementsForUser, never a replacement: that one is shared
 *  with the personal-data export and must keep returning everything.
 *
 *  OFFSET, not a cursor. The tempting argument is "an append-only ledger's
 *  cursor never shifts", but the ordering key is periodTo — the billing
 *  period's end, not insert time — so a correction settling an older period
 *  sorts into the MIDDLE of the list, not onto the end. The stability the
 *  cursor argument depends on simply isn't there. Offset also yields a real
 *  total and the ability to jump pages, which reconciliation needs. */
export async function settlementsPageForUser(
  userId: string,
  page = 1,
  perPage = 50,
): Promise<{ rows: WarehouseSettlementRow[]; total: number; page: number; perPage: number }> {
  const db = getDb();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePerPage = Math.max(1, Math.trunc(perPage) || 50);
  const where = eq(warehouseSettlements.userId, userId);
  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(warehouseSettlements)
      .where(where)
      // `id` breaks ties so offset paging is deterministic when several
      // settlements share a periodTo.
      .orderBy(desc(warehouseSettlements.periodTo), desc(warehouseSettlements.id))
      .limit(safePerPage)
      .offset((safePage - 1) * safePerPage),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(warehouseSettlements).where(where),
  ]);
  return { rows, total: counted[0]?.n ?? 0, page: safePage, perPage: safePerPage };
}

export interface CustomerSettlementOverview {
  userId: string;
  name: string | null;
  mobile: string;
  activeItemCount: number;
  totalUnsettledToman: number;
}

export interface CustomerSettlementOverviewResult {
  customers: CustomerSettlementOverview[];
  /** Sum of every customer's totalUnsettledToman, computed here where the
   *  per-item numbers are already in hand. The headline figure is then
   *  authoritative rather than "the sum of whatever the client happened to
   *  have loaded". */
  grandTotalUnsettledToman: number;
  /** True when the active-item count exceeded ITEM_CAP and the numbers above
   *  therefore cover only part of the warehouse. Surfaced to the admin — a
   *  silently truncated money figure is worse than no figure. */
  truncated: boolean;
}

/** The point past which the docstring's "the number of consignment customers
 *  is small" has stopped being true. Beyond this the in-memory aggregation
 *  needs to become a SQL GROUP BY; until then, say so out loud instead of
 *  timing out. */
const ITEM_CAP = 2000;

/** One row per customer with at least one active (non-deleted) warehouse
 *  item, plus their total currently-unsettled amount across all of them —
 *  the admin's "who do I need to settle with" starting point. In-memory
 *  aggregation rather than a SQL GROUP BY: the number of consignment
 *  customers is small, and the per-item unsettled calc already needs one
 *  query per item's last settlement either way.
 *
 *  Those per-item queries are issued as ONE BATCH (Promise.all), not
 *  serially. They are independent of each other — nothing about item N's
 *  last settlement informs item N+1's — so awaiting them in a loop bought
 *  nothing and cost n sequential round-trips, making page latency
 *  n × RTT instead of ~1 × RTT. Same queries, same semantics, same results;
 *  only the waiting is gone.
 *
 *  Note that pagination would NOT have helped here: the expensive work is
 *  the per-item fan-out, and a LIMIT/OFFSET on the OUTPUT would slice the
 *  array after all of it had already happened — identical latency and DB
 *  load, less information on screen. */
export async function customerSettlementOverview(): Promise<CustomerSettlementOverviewResult> {
  const db = getDb();
  const rawItems = await db
    .select({ item: warehouseItems, name: users.name, mobile: users.mobile })
    .from(warehouseItems)
    .innerJoin(users, eq(warehouseItems.userId, users.id))
    .where(isNull(warehouseItems.deletedAt))
    // Deterministic order so the capped subset is stable between reloads.
    .orderBy(warehouseItems.id)
    .limit(ITEM_CAP + 1);

  const truncated = rawItems.length > ITEM_CAP;
  const items = truncated ? rawItems.slice(0, ITEM_CAP) : rawItems;

  // audit-2026-08-08: this used to be `Promise.all(items.map(unsettledFor))`
  // — up to ITEM_CAP (2000) concurrent single-item settlement queries against
  // a pooled connection, the exact pool-starvation pattern `unsettledForMany`
  // was written to fix (see its own doc comment above), just never wired in
  // here. Order-preserving: unsettledForMany maps over `items` in place.
  const summaries = await unsettledForMany(items.map((row) => row.item));

  const byUser = new Map<string, CustomerSettlementOverview>();
  let grandTotalUnsettledToman = 0;
  items.forEach((row, i) => {
    const summary = summaries[i]!;
    grandTotalUnsettledToman += summary.amountToman;
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
  });

  return {
    customers: [...byUser.values()].sort((a, b) => b.totalUnsettledToman - a.totalUnsettledToman),
    grandTotalUnsettledToman,
    truncated,
  };
}
