// @vitest-environment node
/**
 * B-22 (audit-catalog-B-FINAL) — `imageApprovedBy`/`imageApprovedAt` record
 * that a human confirmed a SKU's `imageUrl` is really ITS OWN photo, not a
 * technically-valid image that belongs to a different variant. The one
 * invariant worth pinning: approval is a fact about ONE photo, so it must
 * never survive a later swap to a different `imageUrl` unless that same
 * write explicitly re-confirms it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { createSku, setSkuImageApproval, updateSku } from './catalogAdminRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([{ id: 'c1', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' }]);
  await db
    .insert(schema.subCategories)
    .values([{ id: 's1', categoryId: 'c1', slug: 'deformed', name: 'آجدار', order: 1 }]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('SKU image approval', () => {
  it('a newly created SKU is unapproved by default, even with an image', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-1',
      name: 'میلگرد ۱۴ آجدار',
      imageUrl: '/uploads/a.jpg',
    });
    expect(sku.imageApprovedBy).toBeNull();
    expect(sku.imageApprovedAt).toBeNull();
  });

  it('setSkuImageApproval records the acting admin and a timestamp', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-2',
      name: 'میلگرد ۱۶ آجدار',
      imageUrl: '/uploads/b.jpg',
    });
    const before = Date.now();
    const result = await setSkuImageApproval(sku.id, true, 'admin-1');
    expect(result!.after.imageApprovedBy).toBe('admin-1');
    expect(result!.after.imageApprovedAt).not.toBeNull();
    expect(new Date(result!.after.imageApprovedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('setSkuImageApproval(false) revokes a previous approval', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-3',
      name: 'میلگرد ۱۸ آجدار',
      imageUrl: '/uploads/c.jpg',
    });
    await setSkuImageApproval(sku.id, true, 'admin-1');
    const revoked = await setSkuImageApproval(sku.id, false, 'admin-1');
    expect(revoked!.after.imageApprovedBy).toBeNull();
    expect(revoked!.after.imageApprovedAt).toBeNull();
  });

  it('returns null for a SKU that does not exist', async () => {
    expect(await setSkuImageApproval('no-such-sku', true, 'admin-1')).toBeNull();
  });

  it('changing imageUrl WITHOUT touching approval clears the stale approval', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-4',
      name: 'میلگرد ۲۰ آجدار',
      imageUrl: '/uploads/old.jpg',
    });
    await setSkuImageApproval(sku.id, true, 'admin-1');
    // A plain photo swap — the admin form editing only imageUrl, the way the
    // PATCH route's real payload looks for that action.
    const result = await updateSku(sku.id, { imageUrl: '/uploads/new.jpg' });
    expect(result!.after.imageUrl).toBe('/uploads/new.jpg');
    expect(result!.after.imageApprovedBy).toBeNull();
    expect(result!.after.imageApprovedAt).toBeNull();
  });

  it('changing imageUrl AND re-approving in the same write keeps the new approval', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-5',
      name: 'میلگرد ۲۲ آجدار',
      imageUrl: '/uploads/old2.jpg',
    });
    await setSkuImageApproval(sku.id, true, 'admin-1');
    const result = await updateSku(sku.id, {
      imageUrl: '/uploads/new2.jpg',
      imageApprovedBy: 'admin-2',
      imageApprovedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(result!.after.imageApprovedBy).toBe('admin-2');
    expect(result!.after.imageApprovedAt).not.toBeNull();
  });

  it('leaving imageUrl untouched leaves an existing approval alone', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-6',
      name: 'میلگرد ۲۵ آجدار',
      imageUrl: '/uploads/same.jpg',
    });
    await setSkuImageApproval(sku.id, true, 'admin-1');
    const result = await updateSku(sku.id, { grade: 'A3' });
    expect(result!.after.imageApprovedBy).toBe('admin-1');
    expect(result!.after.imageApprovedAt).not.toBeNull();
  });

  it('setting imageUrl to the SAME value it already had does not clear approval', async () => {
    const sku = await createSku({
      subCategoryId: 's1',
      slug: 'sku-7',
      name: 'میلگرد ۲۸ آجدار',
      imageUrl: '/uploads/stable.jpg',
    });
    await setSkuImageApproval(sku.id, true, 'admin-1');
    const result = await updateSku(sku.id, { imageUrl: '/uploads/stable.jpg' });
    expect(result!.after.imageApprovedBy).toBe('admin-1');
  });
});
