/**
 * Orders (cargo tracking «پیگیری سفارش») and consignment warehouse
 * («انبار مشتریان») — statuses mirror lib/types/domain.ts.
 */
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { PRICE_UNITS, skus } from './catalog';
import { leads, userRequests } from './leads';

export const SHIPMENT_STATUSES = ['registered', 'confirmed', 'loading', 'in_transit', 'delivered'] as const;
export const WAREHOUSE_STATUSES = ['pending', 'stored', 'selling', 'released'] as const;

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    ref: text('ref').notNull().unique(),
    // Orders are real business records — preserve on a deleted user/lead,
    // just detach the reference.
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    status: text('status', { enum: SHIPMENT_STATUSES }).notNull().default('registered'),
    // Carrier tracking (US-08.4) — both optional, set once the shipment is
    // actually booked with a carrier (typically around 'loading'/'in_transit').
    trackingNumber: text('tracking_number'),
    carrierName: text('carrier_name'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    lastUpdate: timestamp('last_update', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Cancel/archive an order without disturbing `status`'s forward-only
    // shipment stepper (registered→…→delivered, guarded by
    // assertForwardTransition — a 'cancelled' status value would need to be
    // special-cased out of that ordinal comparison; a separate column
    // avoids touching that logic at all). Null = active.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('orders_user_idx').on(t.userId),
    // FK with no covering index (W29) — the `leads` ON DELETE SET NULL.
    index('orders_lead_idx').on(t.leadId),
    // Both the admin order list (`ORDER BY placed_at DESC`, ordersRepo:126)
    // and the analytics orders KPI window on `placed_at`, which had no index.
    index('orders_placed_at_idx').on(t.placedAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    // Structural child of the order — goes with it.
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Line item snapshots its own name/qty/price; the sku link is a
    // cross-reference only — preserve the order history on product deletion.
    skuId: text('sku_id').references(() => skus.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    qty: doublePrecision('qty').notNull(),
    unit: text('unit', { enum: PRICE_UNITS }).notNull(),
    weightKg: doublePrecision('weight_kg'),
    unitPrice: bigint('unit_price', { mode: 'number' }),
    lineTotal: bigint('line_total', { mode: 'number' }),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    // FK with no covering index (W29) — the `skus` ON DELETE SET NULL.
    index('order_items_sku_idx').on(t.skuId),
  ],
);

export const warehouseItems = pgTable(
  'warehouse_items',
  {
    id: text('id').primaryKey(),
    ref: text('ref').notNull().unique(),
    // No onDelete override, deliberately: required, and this is real
    // physical inventory a customer has stored — the default RESTRICT
    // blocks deleting a user with active warehouse items instead of
    // orphaning them (who does the stored steel belong to otherwise?).
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    // Provenance — which request/lead actually asked for this (W20). Nullable:
    // items created before this column existed, or entered directly by staff
    // with no customer-filed request behind them, have neither.
    requestId: text('request_id').references(() => userRequests.id, { onDelete: 'set null' }),
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    product: text('product').notNull(),
    sizeLabel: text('size_label'),
    quantityTons: doublePrecision('quantity_tons').notNull(),
    monthlyFeeToman: bigint('monthly_fee_toman', { mode: 'number' }).notNull().default(0),
    // `storedAt` (existing) is unavoidably "the moment this row was inserted" —
    // it defaults on create and nothing ever let it be anything else. `arrivedAt`
    // (W20) is the actual physical-intake date: settable at creation, editable
    // later by a manager. Billing reads `arrivedAt ?? storedAt` so pre-W20 rows
    // keep behaving exactly as before. See warehouseSettlementsRepo.ts.
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    // Stop-clock (W20): stamped once, the instant status transitions into
    // 'released' — accrual clamps to this instead of running forever against
    // stock that has physically left the warehouse.
    releasedAt: timestamp('released_at', { withTimezone: true }),
    // Where in the physical warehouse this sits — free text (bay/rack), not a
    // structured location table; this is a small operation, not a WMS.
    location: text('location'),
    // Who did the physical intake, and any note about it — the closest this
    // schema gets to an intake record without building document/photo upload
    // infrastructure (descoped, see W20 audit report).
    receivedBy: text('received_by').references(() => users.id, { onDelete: 'set null' }),
    intakeNote: text('intake_note'),
    // The public page sells «قرارداد نگهداری» and «بیمهٔ کامل» as headline
    // guarantees; these record that they exist for a given item without
    // building a document-management system.
    contractRef: text('contract_ref'),
    insured: boolean('insured').notNull().default(false),
    storedAt: timestamp('stored_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status', { enum: WAREHOUSE_STATUSES }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Same rationale as orders.deletedAt — keep the pending→…→released
    // forward-only stepper untouched.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('warehouse_items_user_idx').on(t.userId),
    // Three FKs with no covering index (W29) — request/lead ON DELETE SET
    // NULL, received_by ON DELETE SET NULL.
    index('warehouse_items_request_idx').on(t.requestId),
    index('warehouse_items_lead_idx').on(t.leadId),
    index('warehouse_items_received_by_idx').on(t.receivedBy),
    // Admin warehouse list: `ORDER BY stored_at DESC` (ordersRepo:402/439).
    index('warehouse_items_stored_at_idx').on(t.storedAt),
  ],
);

/**
 * Append-only movement log (W20) — the source of truth for "how much is
 * actually here", instead of trusting a single mutable `quantityTons` scalar
 * with no history. Every quantity change on a warehouse item (intake,
 * partial/full release, a manual correction) inserts one row here; the item's
 * own `quantityTons` stays as a fast-read cache of the running total, kept in
 * sync by the repo layer, never edited independently of a movement.
 */
export const WAREHOUSE_MOVEMENT_KINDS = ['receipt', 'release', 'adjustment'] as const;

export const warehouseMovements = pgTable(
  'warehouse_movements',
  {
    id: text('id').primaryKey(),
    warehouseItemId: text('warehouse_item_id')
      .notNull()
      .references(() => warehouseItems.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: WAREHOUSE_MOVEMENT_KINDS }).notNull(),
    // Signed: positive for intake, negative for a release/reduction.
    deltaTons: doublePrecision('delta_tons').notNull(),
    // Snapshot of the running total AFTER this movement — lets the history
    // list render without recomputing a running sum client-side.
    quantityAfterTons: doublePrecision('quantity_after_tons').notNull(),
    note: text('note'),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('warehouse_movements_item_idx').on(t.warehouseItemId, t.createdAt),
    // FK with no covering index (W29) — `users` ON DELETE SET NULL.
    index('warehouse_movements_actor_idx').on(t.actorId),
  ],
);

/**
 * A billing record for one consignment-fee settlement (US-08.5) — real
 * invoicing, not just a report: each row freezes the period it covers, the
 * item's quantity/fee AT settlement time (so a later monthlyFeeToman edit
 * never rewrites history), and the resulting amount. The next settlement's
 * period starts from this row's `periodTo`, not from `storedAt` again — see
 * warehouseSettlementsRepo.ts's `unsettledFor`.
 */
export const warehouseSettlements = pgTable(
  'warehouse_settlements',
  {
    id: text('id').primaryKey(),
    warehouseItemId: text('warehouse_item_id')
      .notNull()
      .references(() => warehouseItems.id, { onDelete: 'cascade' }),
    // Denormalized from warehouseItems.userId — lets "every settlement for
    // this customer" be queried without joining through warehouse_items.
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
    periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
    quantityTons: doublePrecision('quantity_tons').notNull(),
    monthlyFeeToman: bigint('monthly_fee_toman', { mode: 'number' }).notNull(),
    amountToman: bigint('amount_toman', { mode: 'number' }).notNull(),
    note: text('note'),
    // Who settled it — preserve the record if that staff account is later removed.
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    // Manual payment tracking (W20) — no gateway integration, just a record
    // that the money actually came in, kept separate from "billed".
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentNote: text('payment_note'),
    // Void as a REVERSING entry, not a delete or edit (W20): a settlement is
    // an accounting record, so a mistake gets a negative-amount row pointing
    // back at the original rather than rewriting history. `voidedAt` on the
    // ORIGINAL marks it superseded; `voidsSettlementId` on the REVERSING row
    // points at what it corrects. Deliberately not a DB-level self-FK — one
    // soft link the repo layer always sets consistently, not worth the
    // lazy-reference ceremony a self-referencing constraint needs here.
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidsSettlementId: text('voids_settlement_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('warehouse_settlements_item_idx').on(t.warehouseItemId, t.periodTo),
    index('warehouse_settlements_user_idx').on(t.userId),
    // FK with no covering index (W29) — `users` ON DELETE SET NULL.
    index('warehouse_settlements_actor_idx').on(t.actorId),
  ],
);
