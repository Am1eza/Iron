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
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { PRICE_BASES, PRICE_UNITS, skus } from './catalog';
import { users } from './auth';

export const MOVEMENT_DIRS = ['up', 'down', 'flat'] as const;

export const currentPrices = pgTable(
  'current_prices',
  {
    // 1:1 denormalized read row — no reason to keep it once its sku is gone.
    skuId: text('sku_id')
      .primaryKey()
      .references(() => skus.id, { onDelete: 'cascade' }),
    price: bigint('price', { mode: 'number' }).notNull(), // Toman, excl. VAT
    unit: text('unit', { enum: PRICE_UNITS }).notNull(),
    // What `price` is denominated in — see PRICE_BASIS_VALUES. Mirrored from
    // the SKU at write time the same way `unit` is, so a price row stays
    // self-describing.
    priceBasis: text('price_basis', { enum: PRICE_BASES }).notNull().default('kg'),
    deliveryTime: text('delivery_time').notNull().default('۲۴ ساعت'),
    vatIncluded: boolean('vat_included').notNull().default(false),
    movementPct: doublePrecision('movement_pct'),
    movementDir: text('movement_dir', { enum: MOVEMENT_DIRS }).notNull().default('flat'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Nullable already — preserve the price row's history, just drop the
    // reference to a since-deleted staff account.
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    isStale: boolean('is_stale').notNull().default(false),
  },
  // FK with no covering index (W29) — one row per SKU, so deleting a staff
  // account scanned the entire price table.
  (t) => [index('current_prices_updated_by_idx').on(t.updatedBy)],
);

export const pricePoints = pgTable(
  'price_points',
  {
    id: text('id').primaryKey(),
    // Chart history is meaningless without the sku it charts.
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id, { onDelete: 'cascade' }),
    price: bigint('price', { mode: 'number' }).notNull(),
    unit: text('unit', { enum: PRICE_UNITS }).notNull(),
    // Frozen with the point: correcting a SKU's denomination later must not
    // silently re-interpret the history a chart is drawn from.
    priceBasis: text('price_basis', { enum: PRICE_BASES }).notNull().default('kg'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('price_points_sku_at_idx').on(t.skuId, t.at)],
);

/**
 * Automated price mirroring (US-02.5) — the durable trail behind every price
 * this site writes WITHOUT a human typing it.
 *
 * The mirror job runs unattended twice a day and writes straight into
 * `current_prices`; there is deliberately no draft/approval step. That makes
 * this log the only way anyone notices a bad automated write after the fact,
 * so it records the SKIPS too, each with the reason. "Nothing happened to
 * this SKU" and "this SKU was never even looked at" are very different facts
 * when you are trying to explain a wrong number on the site.
 */
export const PRICE_SYNC_SOURCES = ['ahanonline'] as const;
export const PRICE_SYNC_RUN_STATUSES = ['running', 'ok', 'failed'] as const;
export const PRICE_SYNC_TRIGGERS = ['cron', 'manual'] as const;
export const PRICE_SYNC_OUTCOMES = ['written', 'skipped'] as const;
/** How well the competitor's row identified our SKU. Only `exact` is ever
 *  written — see `priceSync.match.ts` for why the others are not. */
export const PRICE_SYNC_CONFIDENCES = ['exact', 'fuzzy', 'uncertain', 'none'] as const;

export const priceSyncRuns = pgTable(
  'price_sync_runs',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: PRICE_SYNC_SOURCES }).notNull(),
    trigger: text('trigger', { enum: PRICE_SYNC_TRIGGERS }).notNull().default('cron'),
    status: text('status', { enum: PRICE_SYNC_RUN_STATUSES }).notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Priced rows parsed off the competitor's category pages. */
    sourceRows: integer('source_rows').notNull().default(0),
    /** Active SKUs the matcher actually looked at. */
    consideredSkus: integer('considered_skus').notNull().default(0),
    written: integer('written').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    error: text('error'),
  },
  (t) => [index('price_sync_runs_started_idx').on(t.startedAt)],
);

export const priceSyncEntries = pgTable(
  'price_sync_entries',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => priceSyncRuns.id, { onDelete: 'cascade' }),
    // Same reasoning as `price_points`: a per-SKU record of what a job did to
    // a SKU is meaningless once that SKU is gone.
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id, { onDelete: 'cascade' }),
    outcome: text('outcome', { enum: PRICE_SYNC_OUTCOMES }).notNull(),
    /** A STABLE machine code (`write:exact`, `skip:no-size-match`), not prose —
     *  the Persian sentence lives in the admin UI so it can be reworded later
     *  without rewriting history. */
    reason: text('reason').notNull(),
    oldPrice: bigint('old_price', { mode: 'number' }),
    newPrice: bigint('new_price', { mode: 'number' }),
    source: text('source', { enum: PRICE_SYNC_SOURCES }).notNull(),
    /** What we matched against, verbatim from the competitor's row — the
     *  evidence for "is this actually the same product?". */
    matchedName: text('matched_name'),
    matchedFactory: text('matched_factory'),
    matchedCode: text('matched_code'),
    matchedUnit: text('matched_unit'),
    /** Their own «تاریخ بروزرسانی» for the row, as published (Jalali text). */
    sourceUpdatedAt: text('source_updated_at'),
    confidence: text('confidence', { enum: PRICE_SYNC_CONFIDENCES }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_sync_entries_run_idx').on(t.runId, t.outcome),
    index('price_sync_entries_sku_idx').on(t.skuId, t.appliedAt),
    // Backs the admin log's keyset pagination (newest first) — the same shape
    // `audit_entries_at_id_idx` exists for.
    index('price_sync_entries_applied_idx').on(t.appliedAt, t.id),
  ],
);
