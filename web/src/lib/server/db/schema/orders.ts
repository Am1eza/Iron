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
    userId: text('user_id').references(() => users.id),
    leadId: text('lead_id').references(() => leads.id),
    status: text('status', { enum: SHIPMENT_STATUSES }).notNull().default('registered'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    lastUpdate: timestamp('last_update', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('orders_user_idx').on(t.userId)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    skuId: text('sku_id').references(() => skus.id),
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
  },
  (t) => [index('warehouse_items_user_idx').on(t.userId)],
);
