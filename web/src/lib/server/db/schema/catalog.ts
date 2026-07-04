/**
 * Catalog — Category 1─* SubCategory 1─* SKU (product/data-model.md §2).
 * Soft-delete only: `isActive=false` hides rows but keeps priced history.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { SeoMeta } from '@/lib/types/domain';

export const PRICE_UNITS = ['kg', 'branch', 'sheet', 'meter'] as const;

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    order: integer('order').notNull().default(0),
    iconId: text('icon_id').notNull().default(''),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    seo: jsonb('seo').$type<SeoMeta>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Trigram index — searchSkus (catalogRepo) joins categories and filters
    // on `ilike(categories.name, '%term%')`; without this it's a sequential
    // scan on every search request.
    index('categories_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);

export const subCategories = pgTable(
  'sub_categories',
  {
    id: text('id').primaryKey(),
    // Structural parent-child (category → sub-category → sku, see below):
    // cascading is correct here — the app never actually hard-deletes
    // categories in normal operation (isActive=false is the real "delete"),
    // this is a safety net for the rare deliberate admin cleanup, and each
    // downstream table (current_prices, price_points, favorites, alerts vs.
    // lead_items, order_items) sets its OWN onDelete appropriately so the
    // cascade doesn't silently destroy real transaction history further down.
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    order: integer('order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    seo: jsonb('seo').$type<SeoMeta>(),
  },
  (t) => [uniqueIndex('sub_categories_category_slug_uq').on(t.categoryId, t.slug)],
);

export const skus = pgTable(
  'skus',
  {
    id: text('id').primaryKey(),
    subCategoryId: text('sub_category_id')
      .notNull()
      .references(() => subCategories.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    standard: text('standard'),
    size: text('size'),
    grade: text('grade'),
    factory: text('factory'),
    theoreticalWeightKg: doublePrecision('theoretical_weight_kg'),
    unit: text('unit', { enum: PRICE_UNITS }).notNull().default('kg'),
    isActive: boolean('is_active').notNull().default(true),
    seo: jsonb('seo').$type<SeoMeta>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('skus_sub_active_idx').on(t.subCategoryId, t.isActive),
    index('skus_cat_active_idx').on(t.categoryId, t.isActive),
    index('skus_factory_idx').on(t.factory),
    // GIN trigram indexes back both the ILIKE '%term%' matching AND the
    // similarity() ranking in catalogRepo.searchSkus — without these, both
    // are full table scans at catalog scale (pg_trgm extension is already
    // enabled, see drizzle/0000_init.sql). `size` stays a plain btree
    // (skus_factory_idx-style) candidate too, but it's short/near-enumerated
    // text where a trigram index adds little over the existing scan cost —
    // `name` and `factory` are the actual free-text search targets.
    index('skus_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
    index('skus_factory_trgm_idx').using('gin', t.factory.op('gin_trgm_ops')),
  ],
);
