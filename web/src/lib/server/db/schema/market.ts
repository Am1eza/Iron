/**
 * Market data — the نبض بازار ticker. usd/eur/gold18/ounce come from tgju via
 * the poll job; billet is admin-entered. On tgju outage rows keep serving with
 * `isStale=true`.
 */
import { boolean, doublePrecision, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { MOVEMENT_DIRS } from './pricing';

export const MARKET_KEYS = ['usd', 'eur', 'gold18', 'ounce', 'billet'] as const;
export const MARKET_SOURCES = ['tgju', 'admin'] as const;

export const marketValues = pgTable('market_values', {
  key: text('key', { enum: MARKET_KEYS }).primaryKey(),
  label: text('label').notNull(),
  // double: ounce is USD with decimals; Toman values are integers well below 2^53
  value: doublePrecision('value').notNull(),
  unit: text('unit').notNull(),
  source: text('source', { enum: MARKET_SOURCES }).notNull(),
  movementDir: text('movement_dir', { enum: MOVEMENT_DIRS }).notNull().default('flat'),
  movementPct: doublePrecision('movement_pct'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  isStale: boolean('is_stale').notNull().default(false),
});

export const marketPoints = pgTable(
  'market_points',
  {
    id: text('id').primaryKey(),
    key: text('key', { enum: MARKET_KEYS }).notNull(),
    value: doublePrecision('value').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('market_points_key_at_idx').on(t.key, t.at)],
);
