/**
 * Engagement — favorites, price alerts (قیمت‌سنج) and club memberships (باشگاه).
 */
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { CLUB_TIERS, users } from './auth';
import { skus } from './catalog';
import { MARKET_KEYS } from './market';

export const NOTIFY_CHANNELS = ['sms', 'telegram', 'whatsapp', 'eitaa'] as const;
export const ALERT_OPS = ['below', 'above'] as const;
export const ALERT_STATUSES = ['active', 'triggered', 'paused'] as const;

export const favorites = pgTable(
  'favorites',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('favorites_user_sku_uq').on(t.userId, t.skuId)],
);

export const alerts = pgTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    targetType: text('target_type', { enum: ['sku', 'market'] }).notNull(),
    skuId: text('sku_id').references(() => skus.id),
    marketKey: text('market_key', { enum: MARKET_KEYS }),
    op: text('op', { enum: ALERT_OPS }).notNull(),
    threshold: bigint('threshold', { mode: 'number' }).notNull(), // Toman
    channel: text('channel', { enum: NOTIFY_CHANNELS }).notNull().default('sms'),
    status: text('status', { enum: ALERT_STATUSES }).notNull().default('active'),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('alerts_status_idx').on(t.status), index('alerts_user_idx').on(t.userId)],
);

export const clubMemberships = pgTable('club_memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  tier: text('tier', { enum: CLUB_TIERS }).notNull().default('iron'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});
