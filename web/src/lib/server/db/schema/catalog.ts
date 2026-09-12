/**
 * Catalog — Category 1─* SubCategory 1─* SKU (product/data-model.md §2).
 * Delete means DELETE: there is no hidden/unpublished state. A row that
 * exists is on the site; a row that shouldn't be on the site is removed.
 * The old `isActive` flag produced a third state — present in the database,
 * invisible to customers, invisible in most admin views — that silently
 * stranded priced products for months. Transaction history is protected by
 * the FK rules below (lead_items/order_items SET NULL), not by keeping dead
 * catalog rows around.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { SeoMeta } from '@/lib/types/domain';

/**
 * How a product is counted — re-exported from `lib/types/domain` so the
 * Drizzle column, every Zod request schema and the client `PriceUnit` type
 * share one list instead of the two hand-maintained copies they used to be.
 * The definition lives there because this module cannot be imported from a
 * client bundle (it pulls in `pg`).
 *
 * `piece` («عدد») is why that mattered: کوپلر میلگرد, and fittings generally,
 * are quoted per piece with no weight to convert through — ahanonline
 * publishes all 65 coupler rows as «واحد: عدد». See `PRICE_UNIT_VALUES` for
 * the full reasoning.
 *
 * Note this is a Drizzle `text(..., { enum })`, i.e. a TypeScript-level union:
 * the column is plain `text` in Postgres with no native enum and no CHECK
 * constraint (verified against the live schema), so adding a member needs no
 * migration. What it DOES need is every `Record<PriceUnit, …>` map to gain a
 * key, which the compiler enforces.
 */
export { PRICE_UNIT_VALUES as PRICE_UNITS } from '@/lib/types/domain';
import { PRICE_UNIT_VALUES } from '@/lib/types/domain';

/**
 * What a stored price is DENOMINATED in — the companion to `unit` above and
 * deliberately a separate column, because the two are separate facts. See
 * `PRICE_BASIS_VALUES` in `lib/types/domain` for the full reasoning and the
 * 74 live rows that proved they are.
 *
 * Same `text(..., { enum })` shape as `unit`, and for the same reason: the
 * column is plain `text` with no native Postgres enum, so the compiler is the
 * enforcement and adding a member needs no migration. Adding the COLUMN did.
 */
export { PRICE_BASIS_VALUES as PRICE_BASES } from '@/lib/types/domain';
import { PRICE_BASIS_VALUES } from '@/lib/types/domain';

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    // Per-locale display names (i18n audit follow-up) — `name` stays the fa
    // source of truth and the ONLY one ever written by the admin catalog
    // form; these three are nullable and read-only from the public site's
    // point of view, filled by a one-time translation backfill for the
    // (small, bounded — 7 rows) taxonomy that existed at that time. A
    // category added after that backfill has null en/ar/zh names until an
    // admin (or a future translation workflow) fills them in; every read
    // site falls back to `name` (fa) when the requested locale's column is
    // null, so a missing translation degrades to "still Persian", never to
    // a blank or broken page.
    nameEn: text('name_en'),
    nameAr: text('name_ar'),
    nameZh: text('name_zh'),
    order: integer('order').notNull().default(0),
    iconId: text('icon_id').notNull().default(''),
    imageUrl: text('image_url'),
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
    // cascading is correct here, and it is now the ONLY delete path — removing
    // a category really removes its sub-categories and products. Each
    // downstream table (current_prices, price_points, favorites, alerts vs.
    // lead_items, order_items) sets its OWN onDelete appropriately so the
    // cascade doesn't silently destroy real transaction history further down.
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // Per-locale display names — same rationale as categories.nameEn/Ar/Zh
    // above (i18n audit follow-up): fa `name` stays the only admin-writable
    // source of truth, these are a one-time backfill with a fa fallback
    // wherever a locale's column is null.
    nameEn: text('name_en'),
    nameAr: text('name_ar'),
    nameZh: text('name_zh'),
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
    seo: jsonb('seo').$type<SeoMeta>(),
  },
  (t) => [
    uniqueIndex('sub_categories_category_slug_uq').on(t.categoryId, t.slug),
    // Required by the composite SKU parent FK below. `id` is already unique,
    // but Postgres requires the exact referenced column set to be unique.
    uniqueIndex('sub_categories_id_category_uq').on(t.id, t.categoryId),
  ],
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
    // «حالت» — the supplied form/finish of a product («رول», «شیت»,
    // «برش‌خورده», «نرمال», …). This must be independent of `grade`:
    // an aluminium sheet can simultaneously be alloy 1050 and supplied as a
    // sheet, so one overloaded text cell cannot represent the product.
    //
    // Nullable and additive. Existing sheet rows historically stored their
    // condition in `grade`; catalogLabels retains a read-only fallback during
    // the rollout, while the verified one-shot migration moves only known
    // condition values and all new admin writes go here.
    condition: text('condition'),
    // One shared optional secondary-spec column. For ورق it is the plate's
    // width×length (e.g. «۱۰۰۰×۲۰۰۰»): `size` already carries sheet
    // THICKNESS, and those other two dimensions previously had nowhere to
    // live. Per the owner's 1405/06 request it also stores a single wall-
    // thickness value (e.g. «۴») for exactly نبشی بال مساوی, بال
    // نامساوی and لقمه, and the gauge beside پروفیل Z's separate height.
    // UI allow-lists decide which meaning applies; وال‌پست, تی‌بار, ordinary
    // box profiles and every other product line stay unaffected.
    // Nullable: ambiguous نبشی rows remain null until an admin records a
    // verified value; newly seeded Z variants carry their published gauge.
    dimensions: text('dimensions'),
    // «رده» — the pipe schedule, i.e. the wall-thickness/pressure class the
    // pipe trade sizes pressure pipe by («رده ۴۰», «رده ۸۰», ASME B36.10).
    // Free text on purpose, exactly like `size` and `standard`: the schedule
    // numbers in actual Iranian market use are not a closed set, and an enum
    // would turn "the owner listed a new class" into a migration.
    //
    // This is a NEW column rather than a reuse of `standard`, which is the
    // reuse the similar-looking ورق/نبشی `dimensions` precedent would
    // suggest. `standard` is already meaningfully populated INSIDE لوله —
    // every live لولهٔ جدار چاه row stores «ST37» in it — so borrowing it
    // would have made one column carry two unrelated meanings within a single
    // category, and the admin form could not have offered both facts on the
    // same product. The ورق/نبشی reuse works precisely because those two
    // meanings never meet under one parent category; here they would.
    //
    // Nullable with no backfill, and offered only on the pressure-pipe subs
    // (see catalogLabels' PIPE_SCHEDULE_SUBS): مبلی and داربستی have no
    // schedule rating at all, and every existing row stays null until an
    // admin records one.
    schedule: text('schedule'),
    factory: text('factory'),
    // Admin-chosen position of this SKU within its own «بر اساس کارخانه»
    // section on the public price page (owner request, 1405/06). The
    // section itself already has an admin-controlled order — `factoryOrder`
    // above, which decides which MILL leads a category. This is the same
    // idea one level down: within one mill's own block of rows, the default
    // «سایز» sort is a plain ascending parse of `size`, which cannot express
    // anything else — it cannot put «۲ برش‌خورده» before «۲ رول» when both
    // SKUs carry the same size string, and the owner reported exactly that:
    // rows he had carefully arranged kept reshuffling back into that plain
    // numeric order. Scoping this to `skus` directly, rather than a second
    // (category, factory, sku) join table mirroring `factoryOrder`'s own
    // shape, is deliberate and safe: unlike a factory name, a SKU already
    // has exactly one home — this same row's own `factory` field — so there
    // is no second context it could need a different rank in.
    // Zero for every existing row (no backfill): a SKU nobody has ranked
    // keeps exactly its current position, since ties fall back to the
    // pre-existing size/price/movement comparator unchanged (see
    // `compareRows` in PriceTable.tsx). Only rows an admin actually gives a
    // non-zero rank change behaviour.
    order: integer('order').notNull().default(0),
    theoreticalWeightKg: doublePrecision('theoretical_weight_kg'),
    unit: text('unit', { enum: PRICE_UNIT_VALUES }).notNull().default('kg'),
    // What the price on this SKU is per, as opposed to what `unit` counts.
    // `'kg'` is both the default and what every pre-existing row always
    // meant, so the backfill is the DEFAULT itself — no data migration, and
    // no row changes meaning. Only the 55 rows that were never per-kilogram
    // are moved off it (scripts/setPriceBasis.ts).
    priceBasis: text('price_basis', { enum: PRICE_BASIS_VALUES }).notNull().default('kg'),
    // Length of ONE شاخه / کلاف, in metres. Nullable and null everywhere it
    // is not published: 6 m and 12 m نبشی are both genuinely sold, so a
    // guessed length is worse than none — `CATALOG_WEIGHT_BASIS` keeps its
    // documented per-line convention as the fallback and this overrides it
    // per row. Also the length a `branch`/`coil` price basis refers to.
    branchLengthM: doublePrecision('branch_length_m'),
    imageUrl: text('image_url'),
    // B-22 (audit-catalog-B-FINAL) — moderation metadata for `imageUrl`. A
    // technically-valid photo (right MIME, right dimensions, uploaded through
    // the hardened `/api/admin/upload` path) can still be the WRONG variant's
    // photo — nothing before this recorded who confirmed it matches this SKU,
    // or where it came from. Both nullable with NO backfill: every existing
    // image stays unapproved-by-default rather than retroactively flagged as
    // wrong, which is exactly as safe as the status quo (nothing reads these
    // columns to hide or downrank an image yet — see catalogAdminRepo).
    // `updateSku` clears both whenever `imageUrl` itself changes without the
    // same write also setting approval, because an approval is a fact about
    // ONE photo: it must not silently survive onto whatever the admin swaps
    // the picture to next.
    imageApprovedBy: text('image_approved_by'),
    imageApprovedAt: timestamp('image_approved_at', { withTimezone: true }),
    // Manual price override — «قیمت این کالا دستی است، خودکار به‌روزرسانی نشود».
    // The automated mirror (priceSync.service.ts) skips any SKU flagged here
    // and records the skip, so a deliberately hand-entered price is never
    // silently clobbered by the next twice-daily run. Defaults to false:
    // auto-sync applies to everything unless an admin explicitly opts a SKU
    // out, which is the owner's stated default.
    priceSyncExcluded: boolean('price_sync_excluded').notNull().default(false),
    // A SKU has exactly one home (subCategoryId/categoryId above) — that's
    // what its URL is built from. This is an ADDITIONAL, non-exclusive tag:
    // category IDs this SKU should also be listed under (e.g. a sheet-steel
    // product living under "ورق" also tagged into "استیل"), without a second
    // row or a second URL. Same jsonb-array-of-ids pattern already used for
    // articles.relatedCategoryIds — see catalogRepo's crossListedInCategory
    // for the `@>` containment query this backs.
    crossListedCategoryIds: jsonb('cross_listed_category_ids').$type<string[]>(),
    // Database-owned structural identity. Marketing name and slug are
    // intentionally excluded: changing copy must not manufacture a second
    // physical product. The separators/digit folding catches visually equal
    // Persian inputs even when a script bypasses the API normalizers.
    // `/` is deliberately excluded from the stripped separator class below:
    // it is the fraction separator («۱/۲ اینچ» = 1/2"), the one character
    // here that carries meaning rather than decoration. Stripping it to
    // nothing collided a 1/2" pipe with a 12" pipe in production (both
    // folded to "12"). Every other separator really is decoration around an
    // already-explicit token (e.g. the space in "14 x 14" next to the
    // literal "x"), so those still vanish entirely.
    identityKey: text('identity_key').generatedAlwaysAs(sql`
      lower(regexp_replace(
        translate(
          (case when coalesce("size", '') = '' and coalesce("grade", '') = '' and
            coalesce("condition", '') = '' and coalesce("dimensions", '') = '' and
            coalesce("schedule", '') = '' and coalesce("standard", '') = ''
          then coalesce("name", '') || '|' || coalesce("factory", '')
          else coalesce("size", '') || '|' || coalesce("grade", '') || '|' ||
            coalesce("condition", '') || '|' || coalesce("dimensions", '') || '|' ||
            coalesce("schedule", '') || '|' || coalesce("standard", '') || '|' ||
            coalesce("factory", '') end)
          || '|' || "unit" || '|' || "price_basis",
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹كيىةآأإ×X*٭‌',
          '01234567890123456789کییهاااxxxx '
        ),
        '[[:space:]_.،,;؛:()\\[\\]{}\\\\-]+', '', 'g'
      ))
    `),
    seo: jsonb('seo').$type<SeoMeta>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'skus_sub_category_parent_fk',
      columns: [t.subCategoryId, t.categoryId],
      foreignColumns: [subCategories.id, subCategories.categoryId],
    }).onDelete('cascade').onUpdate('cascade'),
    check('skus_order_range_ck', sql`${t.order} between 0 and 10000`),
    check('skus_weight_range_ck', sql`${t.theoreticalWeightKg} is null or (${t.theoreticalWeightKg} > 0 and ${t.theoreticalWeightKg} <= 100000)`),
    check('skus_branch_length_range_ck', sql`${t.branchLengthM} is null or (${t.branchLengthM} > 0 and ${t.branchLengthM} <= 100)`),
    check('skus_unit_ck', sql`${t.unit} in ('kg','branch','sheet','meter','piece','sqm')`),
    check('skus_price_basis_ck', sql`${t.priceBasis} in ('kg','branch','coil','sheet','piece','sqm')`),
    index('skus_sub_idx').on(t.subCategoryId),
    index('skus_cat_idx').on(t.categoryId),
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
    uniqueIndex('skus_sub_structural_identity_uq').on(
      t.subCategoryId,
      t.identityKey,
      sql`coalesce(${t.branchLengthM}, -1)`,
    ),
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

/** B-06 (audit-catalog-B-FINAL) status a registered factory name can hold. */
export const FACTORY_REGISTRY_STATUS_VALUES = ['verified', 'unverified'] as const;
export type FactoryRegistryStatus = (typeof FACTORY_REGISTRY_STATUS_VALUES)[number];

/**
 * The factory REGISTRY — a source of truth for "is this a real mill?",
 * separate from `skus.factory` and from `factoryOrder` above.
 *
 * `skus.factory` stays free text on purpose (see `factoryOrder`'s own
 * doc comment: ~470 live values, no migration forces a foreign key onto an
 * admin overnight). That freedom is exactly B-06's finding: nothing stops a
 * typo or a fabricated name from becoming a "real" factory in search facets
 * or AI grounding once ANY SKU carries it — `normalizeFactoryName` only
 * collapses spelling variants of a name, it never asks whether the name
 * refers to a mill that exists.
 *
 * This table does not enforce anything by itself — `skus.factory` is not a
 * foreign key into it, and no existing write path is blocked by an absent
 * row here. It is deliberately the minimal missing piece: a queryable place
 * to record which factory names have actually been confirmed (by whom/what
 * source, and when), so a future gate — a search facet, the AI grounding
 * context, an admin warning badge — has something real to check against
 * instead of trusting every string that has ever been typed into `factory`.
 * Building that gate is out of scope here; recording the fact is not.
 */
export const factoryRegistry = pgTable(
  'factory_registry',
  {
    id: text('id').primaryKey(),
    /** Display spelling — what an admin typed, after the same
     *  `normalizeFactoryName` every `skus.factory` write already goes
     *  through, so the registry can never itself invent a ZWNJ/spacing
     *  variant of a name already in use. */
    name: text('name').notNull(),
    /** The de-duplication key. Currently identical to `name` (both are
     *  already `normalizeFactoryName`'s output) — kept as its own column,
     *  not a derived read, so a future stricter fold (e.g. case/prefix
     *  insensitivity) changes one column instead of every comparison site,
     *  and so the unique index below has an explicit column to name. */
    normalizedName: text('normalized_name').notNull(),
    status: text('status', { enum: FACTORY_REGISTRY_STATUS_VALUES }).notNull().default('unverified'),
    /** Free text: where the verification came from (owner confirmation, the
     *  mill's own published listing, a phone call, …). Null for an
     *  unverified entry — there is nothing to source yet. */
    source: text('source'),
    /** Set only when `status` moves to `'verified'`; null otherwise. Not a
     *  DB CHECK against `status` on purpose — `upsertFactoryRegistry` is the
     *  single write path and already keeps the two in lockstep, and a two-
     *  column CHECK here would duplicate that rule for no caller that
     *  bypasses the repo. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('factory_registry_normalized_name_uq').on(t.normalizedName),
    check('factory_registry_status_ck', sql`${t.status} in ('verified','unverified')`),
  ],
);
