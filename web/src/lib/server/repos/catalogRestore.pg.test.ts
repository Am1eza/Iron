// @vitest-environment node
/**
 * There is still no `deletedAt`, no trash bin, and no changing that
 * decision (`961bb34`, PR #357 — "delete means delete" stays locked). What
 * changed is what a delete leaves behind to recover FROM: `deleteCategory`
 * and `deleteSubCategory` now snapshot the whole subtree they cascade away
 * (`catalogAdminRepo.ts`), and these `restore*` functions replay that
 * snapshot back into the tables it came out of.
 *
 * Price history is never part of the snapshot and never comes back — a
 * restored product starts exactly like a brand-new one, chartless, until the
 * next sync writes a point.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  deleteCategory,
  deleteSku,
  deleteSubCategory,
  restoreCategory,
  restoreSku,
  restoreSubCategory,
} from './catalogAdminRepo';

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([{ id: 'c-1', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' }]);
  await db.insert(schema.subCategories).values([
    { id: 's-1', categoryId: 'c-1', slug: 'deformed', name: 'آجدار', order: 1 },
  ]);
  await db.insert(schema.skus).values([
    { id: 'k-1', subCategoryId: 's-1', categoryId: 'c-1', slug: 'k-1', name: 'میلگرد ۱۴', unit: 'kg' },
    { id: 'k-2', subCategoryId: 's-1', categoryId: 'c-1', slug: 'k-2', name: 'میلگرد ۱۶', unit: 'kg' },
  ]);
}, 120_000);

afterEach(async () => {
  await close();
});

describe('restoring a product', () => {
  it('brings the exact row back from its own delete snapshot', async () => {
    const removed = await deleteSku('k-1');
    expect(await db.select().from(schema.skus).where(eq(schema.skus.id, 'k-1'))).toHaveLength(0);

    const restored = await restoreSku(removed as never);
    expect(restored).toMatchObject({ id: 'k-1', name: 'میلگرد ۱۴' });
    expect(await db.select().from(schema.skus).where(eq(schema.skus.id, 'k-1'))).toHaveLength(1);
  });

  it('is safe to replay — a second restore of a row already back is a no-op, not a duplicate-key error', async () => {
    const removed = await deleteSku('k-1');
    await restoreSku(removed as never);
    expect(await restoreSku(removed as never)).toBeNull();
    expect(await db.select().from(schema.skus).where(eq(schema.skus.id, 'k-1'))).toHaveLength(1);
  });
});

describe('restoring a sub-category', () => {
  it('brings the sub-category and every product it took down with it', async () => {
    const result = await deleteSubCategory('s-1');
    expect(await db.select().from(schema.skus)).toHaveLength(0);

    const restored = await restoreSubCategory(result!.removed as never, result!.subtree.skus as never);
    expect(restored.subCategory).toMatchObject({ id: 's-1' });
    expect(restored.skus.map((s) => s.id).sort()).toEqual(['k-1', 'k-2']);
    expect(await db.select().from(schema.skus)).toHaveLength(2);
  });
});

describe('restoring a category', () => {
  it('brings the category, its sub-categories and their products back in one shot', async () => {
    const result = await deleteCategory('c-1');
    expect(await db.select().from(schema.subCategories)).toHaveLength(0);
    expect(await db.select().from(schema.skus)).toHaveLength(0);

    const restored = await restoreCategory(
      result!.removed as never,
      result!.subtree.subCategories as never,
      result!.subtree.skus as never,
    );
    expect(restored.category).toMatchObject({ id: 'c-1' });
    expect(restored.subCategories.map((s) => s.id)).toEqual(['s-1']);
    expect(restored.skus.map((s) => s.id).sort()).toEqual(['k-1', 'k-2']);

    // Referential integrity survived the round trip: the restored products
    // still resolve through the restored sub-category and category.
    const joined = await db
      .select()
      .from(schema.skus)
      .innerJoin(schema.subCategories, eq(schema.subCategories.id, schema.skus.subCategoryId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.skus.categoryId));
    expect(joined).toHaveLength(2);
  });
});
