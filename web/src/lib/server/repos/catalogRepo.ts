/**
 * Catalog reads — categories, price tables (PriceRow = SKU ⋈ current price)
 * and SKU detail. DTO note: PriceRow.categoryId/subCategoryId carry the SLUGS
 * (not raw ids) because the frontend builds /prices/{cat}/{sub}/{sku} links
 * from these fields (mock fixtures established that contract).
 */
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories, skus, currentPrices, pricePoints, factoryOrder } from '@/lib/server/db/schema';
import type { Category, SubCategory, PriceRow, PricePoint } from '@/lib/types/domain';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { likeContains } from '@/lib/server/utils/likeEscape';
import { factoryFacetSlug, sizeFacetSlug } from '@/lib/utils/catalogFacets';

/** `db.execute(sql...)` returns a plain array under one driver (pglite,
 *  tests) and `{ rows: [...] }` under another (node-postgres, prod) — same
 *  ambiguity already handled this way in jobs/cleanup.job.ts. */
function rowsOf<T>(execResult: unknown): T[] {
  if (Array.isArray(execResult)) return execResult as T[];
  return (execResult as { rows?: T[] })?.rows ?? [];
}

/* ------------------------------ mapping ------------------------------ */

type JoinedRow = {
  sku: typeof skus.$inferSelect;
  price: typeof currentPrices.$inferSelect | null;
  catSlug: string;
  subSlug: string;
};

/**
 * `withhold: false` keeps the numbers on the row even when the price is
 * stale-hidden. That is ONLY ever correct for the admin pricing grid: hiding
 * a price the operator is being asked to REPLACE is the exact inverse of what
 * the rule is for. `priceHidden`/`isStale` are reported truthfully either
 * way, so the panel can still badge the row «مخفی».
 */
function toPriceRow(
  r: JoinedRow,
  s: { isStale: (d: Date) => boolean; isHidden: (d: Date) => boolean },
  withhold = true,
): PriceRow {
  const p = r.price;
  const hidden = p ? s.isHidden(p.updatedAt) : true;
  const withheld = hidden && withhold;
  return {
    id: r.sku.id,
    subCategoryId: r.subSlug,
    categoryId: r.catSlug,
    slug: r.sku.slug,
    name: r.sku.name,
    standard: r.sku.standard ?? undefined,
    size: r.sku.size ?? undefined,
    grade: r.sku.grade ?? undefined,
    dimensions: r.sku.dimensions ?? undefined,
    factory: r.sku.factory ?? undefined,
    theoreticalWeightKg: r.sku.theoreticalWeightKg ?? undefined,
    unit: r.sku.unit,
    priceBasis: r.sku.priceBasis,
    branchLengthM: r.sku.branchLengthM ?? undefined,
    imageUrl: r.sku.imageUrl ?? undefined,
    isActive: r.sku.isActive,
    current: {
      skuId: r.sku.id,
      // Hidden-stale prices are not exposed (UI shows «تماس بگیرید»).
      price: p && !withheld ? p.price : 0,
      unit: p?.unit ?? r.sku.unit,
      // The SKU is the authority on the denomination, exactly as it is on the
      // unit: an admin who corrects a SKU from «per kilogram» to «per کلاف»
      // must not leave the price row still claiming the old basis.
      priceBasis: p?.priceBasis ?? r.sku.priceBasis,
      deliveryTime: p && !withheld ? p.deliveryTime : '',
      vatIncluded: p?.vatIncluded ?? false,
      movementPct: p && !withheld ? (p.movementPct ?? undefined) : undefined,
      movementDir: p && !withheld ? p.movementDir : 'flat',
      updatedAt: (p?.updatedAt ?? r.sku.updatedAt).toISOString(),
      isStale: p ? s.isStale(p.updatedAt) : true,
      priceHidden: hidden,
    },
  };
}

/* ------------------------------- reads ------------------------------- */

export async function listCategories(): Promise<Category[]> {
  const rows = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.order));
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    order: c.order,
    iconId: c.iconId,
    imageUrl: c.imageUrl ?? undefined,
    isActive: c.isActive,
    // `|| undefined`, not `?? undefined`: a description saved as an empty
    // string is "not set", and letting '' through would render an empty
    // paragraph in the mega-menu and an empty `description` in the JSON-LD.
    description: c.seo?.description || undefined,
  }));
}

export async function findCategoryBySlug(slug: string): Promise<Category | null> {
  const rows = await getDb().select().from(categories).where(eq(categories.slug, slug)).limit(1);
  const c = rows[0];
  if (!c || !c.isActive) return null;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    order: c.order,
    iconId: c.iconId,
    imageUrl: c.imageUrl ?? undefined,
    isActive: c.isActive,
    description: c.seo?.description || undefined,
  };
}

/**
 * For every category a SKU is cross-listed INTO (crossListedCategoryIds —
 * e.g. a sheet-steel product tagged into «استیل»), the distinct real
 * sub-categories those SKUs actually live under — e.g. «استیل»'s hub page
 * needs to offer «ورق استیل» as a filter option even though that
 * sub-category structurally belongs to «ورق», not to «استیل» itself.
 * `jsonb_array_elements_text` unnests the tag array; the lateral join is
 * one SKU-row fan-out per tag, cheap at this catalog's size.
 */
async function crossListedSubsByCategory(): Promise<
  Record<string, Array<{ slug: string; name: string; groupLabel: string | null }>>
> {
  const db = getDb();
  const result = await db.execute<{
    targetCatSlug: string;
    slug: string;
    name: string;
    groupLabel: string | null;
    subOrder: number;
  }>(sql`
    SELECT DISTINCT ON (target_cat.slug, sub.slug)
      target_cat.slug AS "targetCatSlug",
      sub.slug AS slug,
      sub.name AS name,
      sub.group_label AS "groupLabel",
      sub."order" AS "subOrder"
    FROM ${skus} s
    JOIN ${subCategories} sub ON sub.id = s.sub_category_id AND sub.is_active = true
    CROSS JOIN LATERAL jsonb_array_elements_text(s.cross_listed_category_ids) AS cl(cat_id)
    JOIN ${categories} target_cat ON target_cat.id = cl.cat_id AND target_cat.is_active = true
    WHERE s.is_active = true AND s.cross_listed_category_ids IS NOT NULL
    ORDER BY target_cat.slug, sub.slug, sub."order"
  `);
  const out: Record<string, Array<{ slug: string; name: string; groupLabel: string | null }>> = {};
  for (const r of rowsOf<{ targetCatSlug: string; slug: string; name: string; groupLabel: string | null }>(result)) {
    (out[r.targetCatSlug] ??= []).push({ slug: r.slug, name: r.name, groupLabel: r.groupLabel });
  }
  return out;
}

/** Every ACTIVE sub-category of every ACTIVE category in ONE query, grouped
 *  by category slug — feeds the public nav/mega-menu/home cascade so an
 *  admin-created sub-category appears site-wide without a code change.
 *  Also folds in cross-listed sub-categories (see crossListedSubsByCategory)
 *  so a hub category like «استیل» offers real filter options even though it
 *  owns no sub-categories of its own. */
export async function listAllSubCategories(): Promise<
  Record<string, Array<{ slug: string; name: string; groupLabel: string | null }>>
> {
  const [rows, crossListed] = await Promise.all([
    getDb()
      .select({
        catSlug: categories.slug,
        slug: subCategories.slug,
        name: subCategories.name,
        groupLabel: subCategories.groupLabel,
      })
      .from(subCategories)
      .innerJoin(categories, eq(subCategories.categoryId, categories.id))
      .where(and(eq(categories.isActive, true), eq(subCategories.isActive, true)))
      .orderBy(asc(subCategories.order)),
    crossListedSubsByCategory(),
  ]);
  const out: Record<string, Array<{ slug: string; name: string; groupLabel: string | null }>> = {};
  for (const r of rows) (out[r.catSlug] ??= []).push({ slug: r.slug, name: r.name, groupLabel: r.groupLabel });
  for (const [catSlug, subs] of Object.entries(crossListed)) {
    const existing = out[catSlug] ?? [];
    const seen = new Set(existing.map((s) => s.slug));
    for (const s of subs) if (!seen.has(s.slug)) existing.push(s);
    out[catSlug] = existing;
  }
  return out;
}

export async function listSubCategories(categorySlug: string): Promise<SubCategory[]> {
  const rows = await getDb()
    .select({ sub: subCategories })
    .from(subCategories)
    .innerJoin(categories, eq(subCategories.categoryId, categories.id))
    .where(and(eq(categories.slug, categorySlug), eq(subCategories.isActive, true)))
    .orderBy(asc(subCategories.order));
  return rows.map(({ sub }) => ({
    id: sub.id,
    categoryId: sub.categoryId,
    slug: sub.slug,
    name: sub.name,
    groupLabel: sub.groupLabel,
    order: sub.order,
    isActive: sub.isActive,
  }));
}

/**
 * The grade codes that ACTUALLY exist in the active catalog, per category
 * name — e.g. `{ 'میلگرد': ['A2', 'A3'] }`.
 *
 * This exists because the advisor invented some. On a live turn (2026-08-18)
 * it offered a customer «`B400B500` یا `B500B600`» as the grades to choose
 * from; neither string occurs anywhere in this codebase or this catalog. The
 * model had no grounded list to draw on — `grade` is a real column that
 * nothing in the AI path ever read — so it filled the gap from its own
 * pre-training, which is precisely what rule 1 forbids for numbers and had no
 * equivalent for vocabulary. Fed into the advisor's domain facts.
 *
 * Sorted and deduped so the string is stable (it is cached, and it is part of
 * the relay's prompt-cache prefix).
 */
export async function gradesByCategory(): Promise<Record<string, string[]>> {
  const rows = await getDb()
    .selectDistinct({ cat: categories.name, grade: skus.grade })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .where(
      and(
        eq(skus.isActive, true),
        eq(categories.isActive, true),
        eq(subCategories.isActive, true),
        sql`${skus.grade} is not null and ${skus.grade} <> ''`,
      ),
    );
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.grade) continue;
    (out[r.cat] ??= []).push(r.grade);
  }
  for (const cat of Object.keys(out)) out[cat] = [...new Set(out[cat])].sort();
  return out;
}

/**
 * The admin's chosen factory order for one category, best-first, as plain
 * names (US-18.2). Empty when the admin has never arranged this category —
 * which every caller must treat as "sort the way you sorted before", not as
 * "no factories".
 *
 * Matched by slug rather than id so the price pages, which only ever hold a
 * slug, don't need a second round trip to resolve the category.
 */
export async function factoryOrderForCategory(categorySlug: string): Promise<string[]> {
  const rows = await getDb()
    .select({ factory: factoryOrder.factory })
    .from(factoryOrder)
    .innerJoin(categories, eq(factoryOrder.categoryId, categories.id))
    .where(eq(categories.slug, categorySlug))
    .orderBy(asc(factoryOrder.order), asc(factoryOrder.factory));
  return rows.map((r) => r.factory);
}

/** Price table rows for a category (optionally one sub-category).
 *  `forAdmin` keeps stale-hidden numbers on the row — see `toPriceRow`. */
export async function tableRows(
  categorySlug: string,
  subSlug?: string,
  opts?: { forAdmin?: boolean },
): Promise<PriceRow[]> {
  const db = getDb();
  const targetCat = (
    await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug)).limit(1)
  )[0];
  const conds = [
    // A row belongs on this category's page either natively (its own
    // categoryId) or by cross-listing — a SKU tagged into this category
    // while its real home (and URL) stays wherever it actually lives. See
    // catalog.ts's crossListedCategoryIds doc comment.
    or(
      eq(categories.slug, categorySlug),
      targetCat ? sql`${skus.crossListedCategoryIds} @> ${JSON.stringify([targetCat.id])}::jsonb` : sql`false`,
    )!,
    eq(categories.isActive, true),
    eq(skus.isActive, true),
    eq(subCategories.isActive, true),
  ];
  if (subSlug) conds.push(eq(subCategories.slug, subSlug));
  const rows = await db
    .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(and(...conds))
    .orderBy(asc(subCategories.order), asc(skus.name));
  const s = await getPriceFreshness();
  return rows.map((r) => toPriceRow(r, s, !opts?.forAdmin));
}

/**
 * ONE headline SKU per active category — the row the /prices hub publishes as
 * that category's representative live price.
 *
 * "Headline" = the most recently repriced SKU whose price is still fresh
 * enough to publish. That is the closest proxy this schema has for
 * "most-quoted": the operator reprices what people are actually asking about,
 * so the SKU touched last is the one the market is moving on. A category
 * whose every price has gone stale-hidden contributes its newest row anyway,
 * with the price withheld — the hub then shows «تماس بگیرید» rather than
 * dropping the category out of the summary entirely.
 *
 * Done as a single DISTINCT ON query on purpose: the obvious implementation
 * (tableRows() once per category) is 14 full price-table reads per render,
 * the exact mistake skuCountsByCategory() below documents.
 */
export async function headlineRowPerCategory(): Promise<PriceRow[]> {
  const db = getDb();
  const rows = await db
    .selectDistinctOn([categories.slug], {
      sku: skus,
      price: currentPrices,
      catSlug: categories.slug,
      subSlug: subCategories.slug,
      catOrder: categories.order,
    })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    // DISTINCT ON requires the distinct expression to lead ORDER BY; the real
    // "which row wins" ordering is everything after it.
    .orderBy(
      asc(categories.slug),
      sql`${currentPrices.updatedAt} DESC NULLS LAST`,
      asc(subCategories.order),
      asc(skus.name),
    )
    .where(
      and(
        eq(categories.isActive, true),
        eq(subCategories.isActive, true),
        eq(skus.isActive, true),
      ),
    );
  const s = await getPriceFreshness();
  return rows
    .sort((a, b) => a.catOrder - b.catOrder)
    .map(({ catOrder: _catOrder, ...r }) => toPriceRow(r, s));
}

/**
 * Active SKUs that the public site cannot show because their sub-category
 * (or category) was deactivated underneath them — the half-finished taxonomy
 * migration that left 167 of 240 products unreachable.
 *
 * Every public read filters on `is_active` at all three levels, so these
 * products simply vanish: they are absent from /prices, absent from the
 * pricing grid, and — until this count existed — absent from anything in the
 * panel that could have told the admin they were gone. Scoped to one category
 * when `categorySlug` is given, so the pricing grid can explain its own empty
 * table instead of claiming the category holds no products.
 */
export async function countSkusHiddenByTaxonomy(categorySlug?: string): Promise<number> {
  const conds = [
    eq(skus.isActive, true),
    or(eq(subCategories.isActive, false), eq(categories.isActive, false))!,
  ];
  if (categorySlug) conds.push(eq(categories.slug, categorySlug));
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .where(and(...conds));
  return rows[0]?.n ?? 0;
}

/** Active SKU counts for every category, keyed by category slug, in ONE
 *  query.
 *
 *  The search page needed nothing but `.length` per category, and got it by
 *  calling tableRows() once per category — every SKU row, every joined price,
 *  and a getPriceFreshness() round trip each time, all to be thrown away. At
 *  14 categories that is 14 full price-table reads per render, and the page
 *  did it twice. Counting in the database is the whole fix; the same
 *  active-category/active-sub/active-SKU predicates apply so the numbers stay
 *  identical to what /prices lists. */
export async function skuCountsByCategory(): Promise<Map<string, number>> {
  const db = getDb();
  const [rows, crossListedResult] = await Promise.all([
    db
      .select({ slug: categories.slug, count: sql<number>`count(*)::int` })
      .from(skus)
      .innerJoin(categories, eq(skus.categoryId, categories.id))
      .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
      .where(and(eq(categories.isActive, true), eq(skus.isActive, true), eq(subCategories.isActive, true)))
      .groupBy(categories.slug),
    db.execute<{ slug: string; count: number }>(sql`
      SELECT target_cat.slug AS slug, count(*)::int AS count
      FROM ${skus} s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.cross_listed_category_ids) AS cl(cat_id)
      JOIN ${categories} target_cat ON target_cat.id = cl.cat_id AND target_cat.is_active = true
      WHERE s.is_active = true AND s.cross_listed_category_ids IS NOT NULL
      GROUP BY target_cat.slug
    `),
  ]);
  const out = new Map(rows.map((r) => [r.slug, r.count]));
  for (const r of rowsOf<{ slug: string; count: number }>(crossListedResult)) {
    out.set(r.slug, (out.get(r.slug) ?? 0) + r.count);
  }
  return out;
}

/**
 * Every catalog URL that may legitimately answer 200, as pathnames.
 *
 * Three cheap slug-only queries (no price join, no freshness round trip) —
 * this runs from middleware, cached in-process, so it must stay light.
 *
 * The predicates are deliberately identical to the ones the pages themselves
 * apply, because a mismatch in EITHER direction is a bug: looser and the ghost
 * 200s survive, stricter and a live SKU gets hard-404'd. Concretely:
 *   - `/prices/{cat}` mirrors `listCategories` (active category);
 *   - `/prices/{cat}/{sub}` mirrors `listAllSubCategories` (active sub of an
 *     active category);
 *   - `/prices/{cat}/{sub}/{sku}` mirrors `findSkuRow` — active SKU, active
 *     sub, active category — and is keyed on the SKU's OWN category/sub, so a
 *     SKU requested under some other category's path stays a 404 exactly as
 *     the page intends (it is the duplicate-content guard in the [sku] page).
 *   - `/prices/{cat}/factory/{f}` and `/prices/{cat}/size/{s}` mirror
 *     `tableRows` — including its cross-listing arm, which is why the fourth
 *     query is a UNION rather than the same shape as the others. Both live at
 *     SKU depth, so `GUARDED_PATTERNS`' three-segment rule already covers
 *     them: omitting them here would hard-404 every one of these pages.
 */
export async function publicCatalogPaths(): Promise<string[]> {
  const db = getDb();
  const [cats, subs, sku, facets] = await Promise.all([
    db.select({ slug: categories.slug }).from(categories).where(eq(categories.isActive, true)),
    db
      .select({ cat: categories.slug, sub: subCategories.slug })
      .from(subCategories)
      .innerJoin(categories, eq(subCategories.categoryId, categories.id))
      .where(and(eq(categories.isActive, true), eq(subCategories.isActive, true))),
    db
      .select({ cat: categories.slug, sub: subCategories.slug, sku: skus.slug })
      .from(skus)
      .innerJoin(categories, eq(skus.categoryId, categories.id))
      .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
      .where(
        and(
          eq(skus.isActive, true),
          eq(categories.isActive, true),
          eq(subCategories.isActive, true),
        ),
      ),
    db.execute<{ cat: string; factory: string | null; size: string | null }>(sql`
      SELECT c.slug AS cat, s.factory, s.size
      FROM ${skus} s
      JOIN ${subCategories} sc ON sc.id = s.sub_category_id
      JOIN ${categories} c ON c.id = s.category_id
      WHERE s.is_active AND sc.is_active AND c.is_active
      UNION
      SELECT tc.slug AS cat, s.factory, s.size
      FROM ${skus} s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.cross_listed_category_ids) AS cl(cat_id)
      JOIN ${categories} tc ON tc.id = cl.cat_id AND tc.is_active
      JOIN ${subCategories} sc ON sc.id = s.sub_category_id
      JOIN ${categories} oc ON oc.id = s.category_id
      WHERE s.is_active AND sc.is_active AND oc.is_active
        AND s.cross_listed_category_ids IS NOT NULL
    `),
  ]);

  // Slugs are DERIVED, not stored (see lib/utils/catalogFacets.ts) — the same
  // two functions the pages resolve their segment with, so the guard and the
  // page can only ever agree.
  const facetPaths = new Set<string>();
  for (const r of rowsOf<{ cat: string; factory: string | null; size: string | null }>(facets)) {
    const f = r.factory?.trim() ? factoryFacetSlug(r.factory) : '';
    if (f) facetPaths.add(`/prices/${r.cat}/factory/${f}`);
    const s = r.size?.trim() ? sizeFacetSlug(r.size) : '';
    if (s) facetPaths.add(`/prices/${r.cat}/size/${s}`);
  }

  return [
    ...cats.map((c) => `/prices/${c.slug}`),
    ...subs.map((s) => `/prices/${s.cat}/${s.sub}`),
    ...sku.map((s) => `/prices/${s.cat}/${s.sub}/${s.sku}`),
    ...facetPaths,
  ];
}

/** One SKU by slug (active), with its table row shape. */
export async function findSkuRow(slug: string): Promise<PriceRow | null> {
  const db = getDb();
  const rows = await db
    .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    // W24 audit fix: `subCategories.isActive` was checked by `tableRows` and
    // the two sub-listing queries but NOT here — so deactivating a
    // sub-category left its products as live, crawlable, buyable 200 pages
    // whose own sub page 404s and whose breadcrumb points at that 404. The
    // sub join is already here for `subSlug`; the predicate is the fix.
    .where(
      and(
        eq(skus.slug, slug),
        eq(skus.isActive, true),
        eq(categories.isActive, true),
        eq(subCategories.isActive, true),
      ),
    )
    .limit(1);
  if (!rows[0]) return null;
  const s = await getPriceFreshness();
  return toPriceRow(rows[0], s);
}

/**
 * Batched SKU-id lookup, one query for N ids (favorites/wishlists) instead
 * of N queries — preserves the caller's `ids` order (drizzle's `inArray`
 * does not) so callers with a meaningful order (e.g. favorited-most-recently
 * first) don't need to re-sort.
 */
export async function findSkuRowsByIds(ids: string[]): Promise<PriceRow[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    // `subCategories.isActive` — see the note on findSkuRow (W24).
    .where(
      and(
        inArray(skus.id, ids),
        eq(skus.isActive, true),
        eq(categories.isActive, true),
        eq(subCategories.isActive, true),
      ),
    );
  const s = await getPriceFreshness();
  const bySkuId = new Map(rows.map((r) => [r.sku.id, toPriceRow(r, s)] as const));
  return ids.map((id) => bySkuId.get(id)).filter((r): r is PriceRow => Boolean(r));
}

/** Same-category related rows for cross-sell (excludes self). */
export async function relatedSkuRows(slug: string, limit = 4): Promise<PriceRow[]> {
  const db = getDb();
  const self = await db.select({ categoryId: skus.categoryId }).from(skus).where(eq(skus.slug, slug)).limit(1);
  if (!self[0]) return [];
  const rows = await db
    .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(
      and(
        eq(skus.categoryId, self[0].categoryId),
        ne(skus.slug, slug),
        eq(skus.isActive, true),
        eq(categories.isActive, true),
        // W24: cross-sell must not resurface a product whose sub-category
        // was retired — see the note on findSkuRow.
        eq(subCategories.isActive, true),
      ),
    )
    .orderBy(asc(skus.name))
    .limit(limit);
  const s = await getPriceFreshness();
  return rows.map((r) => toPriceRow(r, s));
}

/** Exported so routes can VALIDATE `range` against the exact same set the
 *  repo falls back on — a route that invented its own list would silently
 *  drift from `skuHistory`'s `?? 90` default. */
export const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

/** Price history for the chart. `range` ∈ 7d|30d|90d|1y (default 90d). */
export async function skuHistory(slug: string, range = '90d'): Promise<PricePoint[]> {
  const days = RANGE_DAYS[range] ?? 90;
  const db = getDb();
  const skuRows = await db.select({ id: skus.id }).from(skus).where(eq(skus.slug, slug)).limit(1);
  if (!skuRows[0]) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(pricePoints)
    .where(and(eq(pricePoints.skuId, skuRows[0].id), gte(pricePoints.at, since)))
    .orderBy(asc(pricePoints.at));
  return rows.map((p) => ({
    id: p.id,
    skuId: p.skuId,
    price: p.price,
    unit: p.unit,
    priceBasis: p.priceBasis,
    at: p.at.toISOString(),
  }));
}

/** Batched price history for MANY slugs in ONE query — the admin pricing
 *  grid's per-row sparklines used to fire one HTTP request per visible row
 *  (60 rows = 60 requests on every load). Returns slug → ascending prices. */
export async function skuHistoryBatch(slugs: string[], range = '30d'): Promise<Record<string, number[]>> {
  if (slugs.length === 0) return {};
  const days = RANGE_DAYS[range] ?? 30;
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ slug: skus.slug, price: pricePoints.price, at: pricePoints.at })
    .from(pricePoints)
    .innerJoin(skus, eq(pricePoints.skuId, skus.id))
    .where(and(inArray(skus.slug, slugs), gte(pricePoints.at, since)))
    .orderBy(asc(pricePoints.at));
  const out: Record<string, number[]> = {};
  for (const r of rows) (out[r.slug] ??= []).push(r.price);
  return out;
}

const ZWNJ = '‌';

/** Spaced spellings of compound product words — users type «تیر آهن» while
 *  the catalog stores «تیرآهن» (idem میلگرد/ناودانی), so the pair would fail
 *  token-AND matching as two separate tokens. Merged BEFORE tokenizing. */
const COMPOUND_WORDS = [
  ['تیر', 'آهن', 'تیرآهن'],
  ['میل', 'گرد', 'میلگرد'],
  ['ناو', 'دانی', 'ناودانی'],
] as const;

/** Street/industry vocabulary → the catalog's canonical product word. Applied
 *  per token as an EXTRA variant (the raw token still matches too). */
const SEARCH_SYNONYMS: Record<string, string> = {
  آرماتور: 'میلگرد',
  هاش: 'تیرآهن',
  ایبیم: 'تیرآهن',
  ناودونی: 'ناودانی',
  قوطی: 'پروفیل',
  ورقه: 'ورق',
};

/** All spellings of one query token worth matching: as typed, ZWNJ-stripped
 *  (typed «تیرآهن» vs stored «تیر‌آهن» and vice versa), digits unified BOTH
 *  ways (the DB stores sizes in PERSIAN digits — «۱۴» — while users often
 *  type 14), and the industry synonym (itself digit/ZWNJ-agnostic). */
function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  for (const t of [token, token.replaceAll(ZWNJ, '')]) {
    variants.add(t);
    variants.add(normalizeDigits(t));
    variants.add(toPersianDigits(t));
  }
  const synonym = SEARCH_SYNONYMS[normalizeDigits(token).replaceAll(ZWNJ, '')];
  if (synonym) {
    variants.add(synonym);
    variants.add(toPersianDigits(synonym));
  }
  return [...variants];
}

/** The whitespace tokens of a query, after the compound-word merge that
 *  searchSkus does — exported shape so callers tokenize exactly as search
 *  does rather than re-implementing it. */
function tokenizeQuery(q: string): string[] {
  let trimmed = q.trim();
  for (const [a, b, joined] of COMPOUND_WORDS) {
    trimmed = trimmed.replace(new RegExp(`${a}[\\s${ZWNJ}]+${b}`, 'g'), joined);
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

/**
 * A token shaped like a market grade code: 1-3 Latin letters + 1-3 digits
 * («A3», «A2», «ST52», «ST37»). Deliberately narrow, because `grade` is
 * matched ONLY for tokens of this shape — see tokenMatchCondition.
 */
const GRADE_TOKEN = /^[A-Za-z]{1,3}\d{1,3}$/;

/** The ILIKE clause searchSkus applies to ONE token, across every column. */
function tokenMatchCondition(token: string) {
  // GRADE, but only for a token that looks like one. «A3» is how every
  // customer names structural rebar and it lives in its own column, which
  // this query did not read — so «میلگرد ۱۴ آجدار A3» matched zero rows and
  // resolveProduct had to guess its way back by DROPPING the word (see
  // unmatchedQueryTokens). Reading the column answers the query directly, and
  // narrowly enough that it cannot widen anything else: a bare size token like
  // «۳» or «32» is not grade-shaped, so it can never pull in every A3 row.
  const gradeMatch = GRADE_TOKEN.test(token) ? [ilike(skus.grade, likeContains(token))] : [];
  return or(
    ...gradeMatch,
    ...tokenVariants(token).flatMap((variant) => {
      const term = likeContains(variant);
      return [ilike(skus.name, term), ilike(skus.factory, term), ilike(skus.size, term), ilike(categories.name, term)];
    }),
  );
}

/**
 * The tokens of `q` that match NOTHING in the active catalog, on their own.
 *
 * searchSkus ANDs its tokens, so one such token turns an otherwise perfect
 * query into zero rows. The live case: grade codes. «A3» is a real thing a
 * customer says and a real thing the advisor repeats back, but it appears in
 * zero SKU names, factories, sizes or category names — the catalog encodes
 * the grade as the sub-category «میلگرد آجدار». So «میلگرد ۱۴ آجدار A3»
 * resolved to `none` while «میلگرد ۱۴ آجدار» resolves to 18 rows.
 *
 * Deliberately NOT wired into searchSkus itself: dropping words silently
 * would change /search's meaning for every query. It is a decision the
 * CALLER makes — see resolveProduct, which retries once without them.
 */
export async function unmatchedQueryTokens(q: string): Promise<string[]> {
  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return [];
  const db = getDb();
  const results = await Promise.all(
    tokens.map(async (token) => {
      const hit = await db
        .select({ one: sql<number>`1` })
        .from(skus)
        .innerJoin(categories, eq(skus.categoryId, categories.id))
        .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
        .where(
          and(
            eq(skus.isActive, true),
            eq(categories.isActive, true),
            eq(subCategories.isActive, true),
            tokenMatchCondition(token),
          ),
        )
        .limit(1);
      return hit.length === 0 ? token : null;
    }),
  );
  return results.filter((t): t is string => t !== null);
}

/**
 * Word-AND search over SKUs (name/factory/size) — powers /search and the AI
 * getPrice tool. Matches per WHITESPACE-SEPARATED TOKEN rather than the
 * whole phrase as one contiguous substring: SKU names are generated as
 * `${category} ${subCategory} ${size}` (e.g. «میلگرد آجدار A3 ۱۴»), so a
 * natural query like «میلگرد ۱۴» has no contiguous match in that string even
 * though both words are clearly present — a single ILIKE '%میلگرد ۱۴%' gate
 * returned zero rows for exactly this query (caught via a live smoke test of
 * the AI advisor's getPrice tool). Each token must match SOME column via ANY
 * of its spelling variants (Persian/Latin digits, ZWNJ, industry synonyms);
 * the full phrase still drives the pg_trgm similarity ranking.
 */
export async function searchSkus(q: string, limit = 20): Promise<PriceRow[]> {
  let trimmed = q.trim();
  for (const [a, b, joined] of COMPOUND_WORDS) {
    trimmed = trimmed.replace(new RegExp(`${a}[\\s${ZWNJ}]+${b}`, 'g'), joined);
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const db = getDb();
  const perTokenMatch = tokens.map((token) => tokenMatchCondition(token));
  const run = (conds: ReturnType<typeof or>[]) =>
    db
      .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
      .from(skus)
      .innerJoin(categories, eq(skus.categoryId, categories.id))
      .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
      .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
      // `subCategories.isActive` — see the note on findSkuRow (W24). Search was
      // the loudest leak of the four: a retired sub-category's products kept
      // ranking in site search and in the AI advisor's getPrice tool.
      .where(
        and(
          eq(skus.isActive, true),
          eq(categories.isActive, true),
          eq(subCategories.isActive, true),
          ...conds,
        ),
      )
      .orderBy(desc(sql`similarity(${skus.name}, ${trimmed})`))
      .limit(limit);

  let rows = await run(perTokenMatch);
  // MISSPELLING FALLBACK — only when the exact match found NOTHING.
  //
  // Every variant above is an EXACT substring match, so a single wrong letter
  // returns zero rows. That went from theoretical to routine when the AI
  // provider changed: the current model garbles tool arguments slightly and
  // was observed asking getPrice for «میلیگرد» (stored: «میلگرد»), which
  // silently produced "we have no such product" instead of a price. Real users
  // mistype too, on a phone, in Persian, about a word with a ZWNJ in it.
  //
  // `word_similarity(token, name)` (pg_trgm) scores the best-matching WORD-ish
  // run inside the name rather than the whole string, so one token still
  // matches a long generated SKU name. The threshold is MEASURED, not guessed:
  // on «میلگرد آجدار A3 ۱۴», word_similarity scores «میلگرد» 1.00, the
  // observed misspelling «میلیگرد» 0.50, the truncation «میلگر» 0.83, and an
  // unrelated product word 0.00. 0.45 sits in the gap — wide enough for a
  // wrong or missing letter, and nowhere near matching a different product.
  //
  // Deliberately a SECOND query, not a widened first one: this can only turn
  // an empty result into a non-empty one. A query that already matched keeps
  // exactly the rows and the ordering it had, so /search — which shares this
  // function — is unchanged for every query that worked before.
  if (rows.length === 0) {
    const perTokenFuzzy = tokens.map((token) =>
      or(
        ...tokenVariants(token).flatMap((variant) => {
          const term = likeContains(variant);
          return [ilike(skus.name, term), ilike(skus.factory, term), ilike(skus.size, term), ilike(categories.name, term)];
        }),
        sql`word_similarity(${token}, ${skus.name}) >= 0.45`,
        sql`word_similarity(${token}, ${categories.name}) >= 0.45`,
      ),
    );
    rows = await run(perTokenFuzzy);
  }
  const s = await getPriceFreshness();
  return rows.map((r) => toPriceRow(r, s));
}
