/**
 * Orders (cargo tracking «پیگیری سفارش») and consignment warehouse
 * («انبار مشتریان») — statuses mirror lib/types/domain.ts.
 */
import {
  bigint,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { PRICE_UNITS, skus } from './catalog';
import { leads } from './leads';

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
  (t) => [index('orders_user_idx').on(t.userId)],
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
  (t) => [index('order_items_order_idx').on(t.orderId)],
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
    product: text('product').notNull(),
    sizeLabel: text('size_label'),
    quantityTons: doublePrecision('quantity_tons').notNull(),
    monthlyFeeToman: bigint('monthly_fee_toman', { mode: 'number' }).notNull().default(0),
    storedAt: timestamp('stored_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status', { enum: WAREHOUSE_STATUSES }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Same rationale as orders.deletedAt — keep the pending→…→released
    // forward-only stepper untouched.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('warehouse_items_user_idx').on(t.userId)],
);
