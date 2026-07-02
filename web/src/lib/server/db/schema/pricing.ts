/**
 * Pricing — admin-entered prices. `current_prices` is the 1:1 denormalized read
 * table; `price_points` is the append-only history behind charts and نوسان.
 * Money is integer Toman (bigint, number mode) — never float.
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
import { PRICE_UNITS, skus } from './catalog';
import { users } from './auth';

export const MOVEMENT_DIRS = ['up', 'down', 'flat'] as const;

export const currentPrices = pgTable('current_prices', {
  skuId: text('sku_id')
    .primaryKey()
    .references(() => skus.id),
  price: bigint('price', { mode: 'number' }).notNull(), // Toman, excl. VAT
  unit: text('unit', { enum: PRICE_UNITS }).notNull(),
  deliveryTime: text('delivery_time').notNull().default('۲۴ ساعت'),
  vatIncluded: boolean('vat_included').notNull().default(false),
  movementPct: doublePrecision('movement_pct'),
  movementDir: text('movement_dir', { enum: MOVEMENT_DIRS }).notNull().default('flat'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').references(() => users.id),
  isStale: boolean('is_stale').notNull().default(false),
});

export const pricePoints = pgTable(
  'price_points',
  {
    id: text('id').primaryKey(),
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id),
    price: bigint('price', { mode: 'number' }).notNull(),
    unit: text('unit', { enum: PRICE_UNITS }).notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('price_points_sku_at_idx').on(t.skuId, t.at)],
);
