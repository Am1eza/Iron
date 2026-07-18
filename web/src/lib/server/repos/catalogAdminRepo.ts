/**
 * Catalog writes (admin) — CRUD with soft-delete only. Hard deletes never
 * happen: priced SKUs keep their history forever (data-model §9).
 */
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories, skus, currentPrices } from '@/lib/server/db/schema';
import type { PriceUnit } from '@/lib/types/domain';

/* ------------------------------ categories ------------------------------ */

export async function adminListCategories() {
  return getDb().select().from(categories).orderBy(asc(categories.order));
}

export async function createCategory(input: { slug: string; name: string; order?: number; iconId?: string }) {
  const rows = await getDb()
    .insert(categories)
    .values({ id: ulid(), slug: input.slug, name: input.name, order: input.order ?? 99, iconId: input.iconId ?? '' })
    .returning();
  return rows[0]!;
}

export async function updateCategory(
  id: string,
  patch: Partial<{ slug: string; name: string; order: number; iconId: string; imageUrl: string | null; isActive: boolean }>,
) {
  const rows = await getDb()
    .update(categories)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(categories.id, id))
    .returning();
  return rows[0] ?? null;
}

/* ---------------------------- sub-categories ---------------------------- */

export async function adminListSubCategories(categoryId?: string) {
  const where = categoryId ? eq(subCategories.categoryId, categoryId) : undefined;
  return getDb().select().from(subCategories).where(where).orderBy(asc(subCategories.order));
}

export async function createSubCategory(input: { categoryId: string; slug: string; name: string; order?: number }) {
  const rows = await getDb()
    .insert(subCategories)
    .values({ id: ulid(), categoryId: input.categoryId, slug: input.slug, name: input.name, order: input.order ?? 99 })
    .returning();
  return rows[0]!;
}

export async function updateSubCategory(
  id: string,
  patch: Partial<{ slug: string; name: string; order: number; isActive: boolean }>,
) {
  const rows = await getDb().update(subCategories).set(patch).where(eq(subCategories.id, id)).returning();
  return rows[0] ?? null;
}

/* --------------------------------- SKUs --------------------------------- */

export async function adminListSkus(query: {
  categoryId?: string;
  subCategoryId?: string;
  q?: string;
  includeInactive?: boolean;
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const conds = [];
  if (query.categoryId) conds.push(eq(skus.categoryId, query.categoryId));
  if (query.subCategoryId) conds.push(eq(skus.subCategoryId, query.subCategoryId));
  if (!query.includeInactive) conds.push(eq(skus.isActive, true));
  if (query.q) conds.push(ilike(skus.name, `%${query.q}%`));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ sku: skus, price: currentPrices })
      .from(skus)
      .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
      .where(where)
      .orderBy(asc(skus.name))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(skus).where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
}

export interface SkuInput {
  subCategoryId: string;
  categoryId: string;
  slug: string;
  name: string;
  standard?: string;
  size?: string;
  grade?: string;
  factory?: string;
  theoreticalWeightKg?: number;
  unit?: PriceUnit;
  imageUrl?: string | null;
}

export async function createSku(input: SkuInput) {
  const rows = await getDb()
    .insert(skus)
    .values({ id: ulid(), unit: input.unit ?? 'kg', ...input })
    .returning();
  return rows[0]!;
}

export async function updateSku(id: string, patch: Partial<SkuInput> & { isActive?: boolean }) {
  const rows = await getDb()
    .update(skus)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(skus.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Soft-delete (isActive=false). Hard delete is intentionally not implemented. */
export async function deactivateSku(id: string) {
  return updateSku(id, { isActive: false });
}
