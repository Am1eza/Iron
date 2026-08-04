/**
 * Catalog reads — categories, price tables (PriceRow = SKU ⋈ current price)
 * and SKU detail. DTO note: PriceRow.categoryId/subCategoryId carry the SLUGS
 * (not raw ids) because the frontend builds /prices/{cat}/{sub}/{sku} links
 * from these fields (mock fixtures established that contract).
 */
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories, skus, currentPrices, pricePoints } from '@/lib/server/db/schema';
import type { Category, SubCategory, PriceRow, PricePoint } from '@/lib/types/domain';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { likeContains } from '@/lib/server/utils/likeEscape';

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
    factory: r.sku.factory ?? undefined,
    theoreticalWeightKg: r.sku.theoreticalWeightKg ?? undefined,
    unit: r.sku.unit,
    imageUrl: r.sku.imageUrl ?? undefined,
    isActive: r.sku.isActive,
    current: {
      skuId: r.sku.id,
      // Hidden-stale prices are not exposed (UI shows «تماس بگیرید»).
      price: p && !withheld ? p.price : 0,
      unit: p?.unit ?? r.sku.unit,
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
  }));
}

export async function findCategoryBySlug(slug: string): Promise<Category | null> {
  const rows = await getDb().select().from(categories).where(eq(categories.slug, slug)).limit(1);
  const c = rows[0];
  if (!c || !c.isActive) return null;
  return { id: c.id, slug: c.slug, name: c.name, order: c.order, iconId: c.iconId, imageUrl: c.imageUrl ?? undefined, isActive: c.isActive };
}

/** Every ACTIVE sub-category of every ACTIVE category in ONE query, grouped
 *  by category slug — feeds the public nav/mega-menu/home cascade so an
 *  admin-created sub-category appears site-wide without a code change. */
export async function listAllSubCategories(): Promise<Record<string, Array<{ slug: string; name: string }>>> {
  const rows = await getDb()
    .select({ catSlug: categories.slug, slug: subCategories.slug, name: subCategories.name })
    .from(subCategories)
    .innerJoin(categories, eq(subCategories.categoryId, categories.id))
    .where(and(eq(categories.isActive, true), eq(subCategories.isActive, true)))
    .orderBy(asc(subCategories.order));
  const out: Record<string, Array<{ slug: string; name: string }>> = {};
  for (const r of rows) (out[r.catSlug] ??= []).push({ slug: r.slug, name: r.name });
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
    order: sub.order,
    isActive: sub.isActive,
  }));
}

/** Price table rows for a category (optionally one sub-category).
 *  `forAdmin` keeps stale-hidden numbers on the row — see `toPriceRow`. */
export async function tableRows(
  categorySlug: string,
  subSlug?: string,
  opts?: { forAdmin?: boolean },
): Promise<PriceRow[]> {
  const db = getDb();
  const conds = [
    eq(categories.slug, categorySlug),
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
  const rows = await getDb()
    .select({ slug: categories.slug, count: sql<number>`count(*)::int` })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .where(and(eq(categories.isActive, true), eq(skus.isActive, true), eq(subCategories.isActive, true)))
    .groupBy(categories.slug);
  return new Map(rows.map((r) => [r.slug, r.count]));
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
 */
export async function publicCatalogPaths(): Promise<string[]> {
  const db = getDb();
  const [cats, subs, sku] = await Promise.all([
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
  ]);
  return [
    ...cats.map((c) => `/prices/${c.slug}`),
    ...subs.map((s) => `/prices/${s.cat}/${s.sub}`),
    ...sku.map((s) => `/prices/${s.cat}/${s.sub}/${s.sku}`),
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
  return rows.map((p) => ({ id: p.id, skuId: p.skuId, price: p.price, unit: p.unit, at: p.at.toISOString() }));
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
  const perTokenMatch = tokens.map((token) =>
    or(
      ...tokenVariants(token).flatMap((variant) => {
        const term = likeContains(variant);
        return [ilike(skus.name, term), ilike(skus.factory, term), ilike(skus.size, term), ilike(categories.name, term)];
      }),
    ),
  );
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
