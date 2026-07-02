/** Favorites — per-user starred SKUs, returned as joined PriceRows. */
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { favorites, skus } from '@/lib/server/db/schema';
import { findSkuRow } from './catalogRepo';
import type { PriceRow } from '@/lib/types/domain';

export async function favoritesForUser(userId: string): Promise<PriceRow[]> {
  const rows = await getDb()
    .select({ skuSlug: skus.slug })
    .from(favorites)
    .innerJoin(skus, eq(favorites.skuId, skus.id))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  const out: PriceRow[] = [];
  for (const r of rows) {
    const row = await findSkuRow(r.skuSlug);
    if (row) out.push(row);
  }
  return out;
}

/** Add by SKU id or slug. Returns false when the SKU doesn't exist. */
export async function addFavorite(userId: string, skuIdOrSlug: string): Promise<boolean> {
  const db = getDb();
  const found = await db
    .select({ id: skus.id })
    .from(skus)
    .where(eq(skus.id, skuIdOrSlug))
    .limit(1);
  const bySlug = found[0]
    ? found
    : await db.select({ id: skus.id }).from(skus).where(eq(skus.slug, skuIdOrSlug)).limit(1);
  const sku = bySlug[0];
  if (!sku) return false;
  await db
    .insert(favorites)
    .values({ id: ulid(), userId, skuId: sku.id })
    .onConflictDoNothing();
  return true;
}

export async function removeFavorite(userId: string, skuIdOrSlug: string): Promise<void> {
  const db = getDb();
  const bySlug = await db.select({ id: skus.id }).from(skus).where(eq(skus.slug, skuIdOrSlug)).limit(1);
  const skuId = bySlug[0]?.id ?? skuIdOrSlug;
  await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.skuId, skuId)));
}
