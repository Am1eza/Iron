/** Durable operation identity and immutable physical/financial evidence. */
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, jsonb, integer, doublePrecision, bigint, index, check } from 'drizzle-orm/pg-core';
import { orders, orderItems, warehouseItems, warehouseSettlements } from './orders';
import { users } from './auth';
import type { NotificationSpec } from '@/lib/server/integrations/smsir';

export const businessOperations = pgTable('business_operations', {
  id: text('id').primaryKey(),
  requestHash: text('request_hash').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderEvents = pgTable('order_events', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  note: text('note').notNull(),
  actorId: text('actor_id'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('order_events_order_idx').on(t.orderId, t.at)]);

export const warehouseBillingEvents = pgTable('warehouse_billing_events', {
  id: text('id').primaryKey(),
  warehouseItemId: text('warehouse_item_id').notNull().references(() => warehouseItems.id, { onDelete: 'restrict' }),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  quantityTons: doublePrecision('quantity_tons').notNull(),
  monthlyFeeToman: bigint('monthly_fee_toman', { mode: 'number' }).notNull(),
  actorId: text('actor_id'),
  note: text('note').notNull(),
}, t => [index('warehouse_billing_events_item_idx').on(t.warehouseItemId, t.effectiveAt),
  check('billing_event_numbers_ck', sql`${t.quantityTons} between 0 and 100000 and ${t.monthlyFeeToman} between 0 and 1000000000`)]);

export const warehouseReservations = pgTable('warehouse_reservations', {
  id: text('id').primaryKey(),
  warehouseItemId: text('warehouse_item_id').notNull().references(() => warehouseItems.id, { onDelete: 'restrict' }),
  orderItemId: text('order_item_id').references(() => orderItems.id, { onDelete: 'restrict' }),
  ownerId: text('owner_id').notNull().references(() => users.id),
  quantityTons: doublePrecision('quantity_tons').notNull(),
  status: text('status', { enum: ['reserved', 'released', 'consumed'] }).notNull().default('reserved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('warehouse_reservations_item_idx').on(t.warehouseItemId, t.status),
  check('reservation_quantity_ck', sql`${t.quantityTons}>0 and ${t.quantityTons}<=100000`)]);

export const warehouseWithdrawals = pgTable('warehouse_withdrawals', {
  id: text('id').primaryKey(),
  warehouseItemId: text('warehouse_item_id').notNull().references(() => warehouseItems.id, { onDelete: 'restrict' }),
  ownerId: text('owner_id').notNull().references(() => users.id),
  quantityTons: doublePrecision('quantity_tons').notNull(),
  recipient: text('recipient').notNull(),
  status: text('status', { enum: ['requested', 'approved', 'delivered', 'cancelled'] }).notNull().default('requested'),
  reservationId: text('reservation_id').references(() => warehouseReservations.id),
  proof: text('proof'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('warehouse_withdrawals_owner_idx').on(t.ownerId, t.createdAt),
  check('withdrawal_quantity_ck', sql`${t.quantityTons}>0 and ${t.quantityTons}<=100000`)]);

export const orderFulfillments = pgTable('order_fulfillments', {
  id: text('id').primaryKey(),
  orderItemId: text('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'restrict' }),
  reservationId: text('reservation_id').references(() => warehouseReservations.id),
  quantity: doublePrecision('quantity').notNull(),
  kind: text('kind', { enum: ['delivery', 'return'] }).notNull(),
  proof: text('proof').notNull(),
  actorId: text('actor_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('order_fulfillments_item_idx').on(t.orderItemId),
  check('fulfillment_quantity_ck', sql`${t.quantity}>0 and ${t.quantity}<1000000000000`)]);

/** Positive amounts are payable to the owner; negative amounts are payouts.
 * A reversal links the exact entry being corrected. This does not send money.
 */
export const warehouseCashEntries = pgTable('warehouse_cash_entries', {
  id: text('id').primaryKey(),
  warehouseItemId: text('warehouse_item_id').notNull().references(() => warehouseItems.id, { onDelete: 'restrict' }),
  ownerId: text('owner_id').notNull().references(() => users.id),
  orderId: text('order_id').references(() => orders.id, { onDelete: 'restrict' }),
  settlementId: text('settlement_id').references(() => warehouseSettlements.id, { onDelete: 'restrict' }),
  kind: text('kind', { enum: ['sale', 'payout', 'payment', 'refund', 'reversal'] }).notNull(),
  amountToman: bigint('amount_toman', { mode: 'number' }).notNull(),
  reversesId: text('reverses_id').unique(),
  proof: text('proof').notNull(),
  actorId: text('actor_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('warehouse_cash_owner_idx').on(t.ownerId, t.createdAt),
  check('warehouse_cash_amount_ck', sql`${t.amountToman}<>0 and ${t.amountToman} between -9007199254740991 and 9007199254740991`)]);

export const operationOutbox = pgTable('operation_outbox', {
  id: text('id').primaryKey(),
  mobile: text('mobile').notNull(),
  message: text('message').notNull(),
  notification: jsonb('notification').$type<NotificationSpec>(),
  status: text('status', { enum: ['pending', 'sending', 'sent', 'uncertain', 'failed'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('operation_outbox_pending_idx').on(t.status, t.nextAttemptAt)]);
