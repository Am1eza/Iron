/**
 * Engagement — favorites, price alerts (قیمت‌سنج) and club memberships (باشگاه).
 */
import { sql } from 'drizzle-orm';
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
    // Pure preference, no historical value beyond the user/sku it points at.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('favorites_user_sku_uq').on(t.userId, t.skuId),
    // The composite above already covers `user_id` (leading column), but NOT
    // `sku_id` — so the ON DELETE CASCADE from `skus` seq-scanned this table
    // on every product deletion (W29).
    index('favorites_sku_idx').on(t.skuId),
  ],
);

export const alerts = pgTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    // An alert with no owner or no target is operationally dead weight (the
    // evaluation job has nothing to notify or compare) — cascade removes it
    // rather than leaving a permanently-orphaned row for either FK.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: ['sku', 'market'] }).notNull(),
    skuId: text('sku_id').references(() => skus.id, { onDelete: 'cascade' }),
    marketKey: text('market_key', { enum: MARKET_KEYS }),
    op: text('op', { enum: ALERT_OPS }).notNull(),
    threshold: bigint('threshold', { mode: 'number' }).notNull(), // Toman
    channel: text('channel', { enum: NOTIFY_CHANNELS }).notNull().default('sms'),
    status: text('status', { enum: ALERT_STATUSES }).notNull().default('active'),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete (W22, same rationale as leads/orders/warehouseItems): a
    // customer's alert history matters once the alert count is a scarce,
    // tier-capped resource — a hard DELETE left zero trace of what a "cap
    // dispute" ("I only had 2!") would need to verify.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Superseded by the composite below for every "this user's alerts"
    // query (user_id is the leading column, so it still serves a bare
    // user_id lookup) — kept `alerts_status_idx` alone since the ADMIN list
    // filters by status ACROSS every user, which the composite can't serve.
    index('alerts_status_idx').on(t.status),
    index('alerts_user_status_idx').on(t.userId, t.status),
    // FK with no covering index (W29) — the `skus` ON DELETE CASCADE above.
    index('alerts_sku_idx').on(t.skuId),
    // Defense in depth (W22): the actual dedup guarantee is the per-user
    // advisory lock + check-then-insert in createAlert(), but nothing before
    // this stopped some OTHER write path (a script, a future admin bulk
    // tool) from inserting a real duplicate active alert. Mirrors the
    // pattern `favorites_user_sku_uq` already uses one table up.
    //
    // TWO separate partial indexes, not one covering both target types: a
    // single index on (user_id, target_type, sku_id, market_key, op,
    // threshold) looks right but is INERT — every row has exactly one of
    // sku_id/market_key NULL (they're mutually exclusive per target_type),
    // and Postgres never treats NULL = NULL as a match in a unique index,
    // so a multi-column index straddling both nullable columns can never
    // detect a conflict for either type (verified against a live DB before
    // fixing — a first attempt at this index passed code review by
    // inspection but enforced nothing). Splitting into one index per target
    // type, scoped by a WHERE predicate on target_type, means the ONE
    // column that matters for each is guaranteed non-null within its own
    // index, so uniqueness is actually enforced. Predicates are written
    // unqualified — see leads.ts's `leads_assignee_callback_idx` comment for
    // why (`sql` inside a partial index WHERE must not be table-qualified).
    uniqueIndex('alerts_active_dedup_sku_uq')
      .on(t.userId, t.skuId, t.op, t.threshold)
      .where(sql`status = 'active' and target_type = 'sku'`),
    uniqueIndex('alerts_active_dedup_market_uq')
      .on(t.userId, t.marketKey, t.op, t.threshold)
      .where(sql`status = 'active' and target_type = 'market'`),
  ],
);

export const clubMemberships = pgTable('club_memberships', {
  id: text('id').primaryKey(),
  // 1:1 with the user, meaningless without them.
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  tier: text('tier', { enum: CLUB_TIERS }).notNull().default('iron'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});
