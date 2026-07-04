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
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
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
      .references(() => subCategories.id),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
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
    // Trigram indexes — searchSkus (catalogRepo) does `ilike('%term%')` across
    // these columns plus `ORDER BY similarity(name, ...)`; a leading-wildcard
    // ILIKE can't use a plain btree index, only a GIN trigram one. This is the
    // hot path behind the one unauthenticated, uncached, DB-hitting endpoint
    // (`GET /api/search`) plus the AI advisor's getPrice/searchGuides tools.
    index('skus_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('skus_factory_trgm_idx').using('gin', sql`${t.factory} gin_trgm_ops`),
    index('skus_size_trgm_idx').using('gin', sql`${t.size} gin_trgm_ops`),
  ],
);
