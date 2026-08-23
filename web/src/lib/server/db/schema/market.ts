/**
 * Market data — the نبض بازار ticker. usd/eur/gold18/ounce come from tgju and
 * billet from esfahanahan, each via its own poll job; `admin` remains a
 * manual override for billet. On a feed outage that feed's rows keep serving
 * with `isStale=true`.
 */
import { boolean, doublePrecision, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { MOVEMENT_DIRS } from './pricing';

export const MARKET_KEYS = ['usd', 'eur', 'gold18', 'ounce', 'billet'] as const;
/** Which upstream last wrote a row. Plain text in Postgres (no enum/check —
 *  see drizzle/0000_init.sql), so adding a member needs no migration. Used to
 *  scope outage flagging: one feed going down must not badge the other's rows
 *  stale. `admin` = hand-entered override (billet only). */
export const MARKET_SOURCES = ['tgju', 'esfahanahan', 'admin'] as const;

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
