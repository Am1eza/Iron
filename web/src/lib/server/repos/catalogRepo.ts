/**
 * Catalog reads — categories, price tables (PriceRow = SKU ⋈ current price)
 * and SKU detail. DTO note: PriceRow.categoryId/subCategoryId carry the SLUGS
 * (not raw ids) because the frontend builds /prices/{cat}/{sub}/{sku} links
 * from these fields (mock fixtures established that contract).
 */
import { and, asc, desc, eq, gte, ilike, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories, skus, currentPrices, pricePoints } from '@/lib/server/db/schema';
import type { Category, SubCategory, PriceRow, PricePoint } from '@/lib/types/domain';
import { isSameJalaliDay, businessDaysSince } from '@/lib/server/utils/jalali';
import { getHolidays, getStaleHideAfterDays } from './settingsRepo';

/* ------------------------------ mapping ------------------------------ */

type JoinedRow = {
  sku: typeof skus.$inferSelect;
  price: typeof currentPrices.$inferSelect | null;
  catSlug: string;
  subSlug: string;
};

async function staleness() {
  const [holidays, hideAfter] = await Promise.all([getHolidays(), getStaleHideAfterDays()]);
  const now = new Date();
  return {
    isStale: (updatedAt: Date) => !isSameJalaliDay(updatedAt, now),
    isHidden: (updatedAt: Date) => businessDaysSince(updatedAt, now, holidays) >= hideAfter,
  };
}

function toPriceRow(r: JoinedRow, s: { isStale: (d: Date) => boolean; isHidden: (d: Date) => boolean }): PriceRow {
  const p = r.price;
  const hidden = p ? s.isHidden(p.updatedAt) : true;
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
    isActive: r.sku.isActive,
    current: {
      skuId: r.sku.id,
      // Hidden-stale prices are not exposed (UI shows «تماس بگیرید»).
      price: p && !hidden ? p.price : 0,
      unit: p?.unit ?? r.sku.unit,
      deliveryTime: p && !hidden ? p.deliveryTime : '',
      vatIncluded: p?.vatIncluded ?? false,
      movementPct: p && !hidden ? (p.movementPct ?? undefined) : undefined,
      movementDir: p && !hidden ? p.movementDir : 'flat',
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

/** Price table rows for a category (optionally one sub-category). */
export async function tableRows(categorySlug: string, subSlug?: string): Promise<PriceRow[]> {
  const db = getDb();
  const conds = [eq(categories.slug, categorySlug), eq(skus.isActive, true), eq(subCategories.isActive, true)];
  if (subSlug) conds.push(eq(subCategories.slug, subSlug));
  const rows = await db
    .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(and(...conds))
    .orderBy(asc(subCategories.order), asc(skus.name));
  const s = await staleness();
  return rows.map((r) => toPriceRow(r, s));
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
    .where(and(eq(skus.slug, slug), eq(skus.isActive, true)))
    .limit(1);
  if (!rows[0]) return null;
  const s = await staleness();
  return toPriceRow(rows[0], s);
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
    .where(and(eq(skus.categoryId, self[0].categoryId), ne(skus.slug, slug), eq(skus.isActive, true)))
    .orderBy(asc(skus.name))
    .limit(limit);
  const s = await staleness();
  return rows.map((r) => toPriceRow(r, s));
}

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

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

/** Substring search over SKUs (name/factory/size) — powers /search and the AI getPrice tool. */
export async function searchSkus(q: string, limit = 20): Promise<PriceRow[]> {
  const term = `%${q.trim()}%`;
  const db = getDb();
  const rows = await db
    .select({ sku: skus, price: currentPrices, catSlug: categories.slug, subSlug: subCategories.slug })
    .from(skus)
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .innerJoin(subCategories, eq(skus.subCategoryId, subCategories.id))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(
      and(
        eq(skus.isActive, true),
        or(ilike(skus.name, term), ilike(skus.factory, term), ilike(skus.size, term), ilike(categories.name, term)),
      ),
    )
    .orderBy(desc(sql`similarity(${skus.name}, ${q.trim()})`))
    .limit(limit);
  const s = await staleness();
  return rows.map((r) => toPriceRow(r, s));
}
