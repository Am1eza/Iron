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
    // Purely a display-time cluster label, NOT a real hierarchy level — the
    // model above is a hard two-level Category → SubCategory, and stays that
    // way (both the URL structure `/prices/[category]/[sub]/[sku]` and every
    // catalog query assume exactly two levels). When set, subcategories that
    // share the same groupLabel within one category render under a shared
    // heading in nav/breadcrumbs/admin (e.g. "ورق رنگی داخلی" and "ورق رنگی
    // خارجی" both tagged "ورق رنگی") without needing a schema/route
    // migration for a genuine third level. Null means "no grouping, list
    // standalone" — the existing, unaffected default for every subcategory
    // that predates this field.
    groupLabel: text('group_label'),
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
    // Sheet dimensions — the width×length of the plate, e.g. «۱۰۰۰×۲۰۰۰».
    // Only ورق has this: `size` already carries a sheet's THICKNESS (which is
    // why the UI labels it «ضخامت» there), and the plate's other two
    // dimensions had nowhere to live. They were being smuggled into `grade`
    // by at least one product before #123 gave grade its own column and that
    // SKU's grade had to be cleared by hand. Nullable and stays null for
    // every existing row — nothing is backfilled, and no other category is
    // asked to fill it in.
    dimensions: text('dimensions'),
    factory: text('factory'),
    theoreticalWeightKg: doublePrecision('theoretical_weight_kg'),
    unit: text('unit', { enum: PRICE_UNITS }).notNull().default('kg'),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    // A SKU has exactly one home (subCategoryId/categoryId above) — that's
    // what its URL is built from. This is an ADDITIONAL, non-exclusive tag:
    // category IDs this SKU should also be listed under (e.g. a sheet-steel
    // product living under "ورق" also tagged into "استیل"), without a second
    // row or a second URL. Same jsonb-array-of-ids pattern already used for
    // articles.relatedCategoryIds — see catalogRepo's crossListedInCategory
    // for the `@>` containment query this backs.
    crossListedCategoryIds: jsonb('cross_listed_category_ids').$type<string[]>(),
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
    // Same `jsonb_path_ops` shape as articles_tags_idx — backs the `@>`
    // containment query crossListedInCategory runs on every load of a hub
    // category page (e.g. /prices/steel).
    index('skus_cross_listed_idx').using('gin', sql`${t.crossListedCategoryIds} jsonb_path_ops`),
  ],
);

/**
 * Admin-chosen display order for the «بر اساس کارخانه» sections of a category's
 * price page (US-18.2, extending the same reordering the taxonomy rail already
 * gives categories and sub-categories).
 *
 * Scoped per CATEGORY on purpose, not globally: which mills matter is a
 * per-product-line fact. «فولاد مبارکه» leads ورق and does not appear in
 * میلگرد at all; «فایکو» is mid-pack in میلگرد and top-two in تیرآهن. A single
 * global list could not express either.
 *
 * Keyed by the factory NAME rather than an id, because `skus.factory` is
 * free text and there is no factories table to point at — introducing one
 * would mean migrating ~470 free-text values behind the admin's back. The
 * unique index below is what keeps one row per (category, factory); a factory
 * renamed on its SKUs simply stops matching and falls back to the unordered
 * bucket, which is the same "no worse than before" behaviour as never having
 * been ordered. Rows are NOT required to cover every factory in a category —
 * anything absent here sorts after everything present (see PriceTable).
 */
export const factoryOrder = pgTable(
  'factory_order',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    factory: text('factory').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('factory_order_category_factory_uq').on(t.categoryId, t.factory),
    // The public price page reads one category's whole list on every ISR
    // regeneration; the unique index above already leads with category_id so
    // this is the same b-tree, but the read is order-by-order and worth
    // stating as its own covering index.
    index('factory_order_category_order_idx').on(t.categoryId, t.order),
  ],
);
