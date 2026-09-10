// @vitest-environment node
/**
 * I-212 — deleting a category cascades away its sub-categories and every
 * product under them (see catalogAdminRepo.deleteCategory); before this fix
 * NONE of those images were ever removed from disk. Proves the category's
 * own image and every cascaded SKU's image are actually gone from disk.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'catalog-1', role: 'catalog' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-category-upload-cleanup-'));
  process.env.UPLOAD_DIR = path.relative(process.cwd(), tmpDir);
});
afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});
afterEach(async () => {
  for (const f of await fs.readdir(tmpDir)) await fs.rm(path.join(tmpDir, f));
});

async function writeFixture(filename: string): Promise<void> {
  await fs.writeFile(path.join(tmpDir, filename), Buffer.from([0xff, 0xd8, 0xff]));
}

const IMG_CATEGORY = '01H10000000000000000000001.jpg';
const IMG_SKU_1 = '01H10000000000000000000002.jpg';
const IMG_SKU_2 = '01H10000000000000000000003.jpg';

import { DELETE } from './route';

function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/admin/catalog/categories/${id}`, { method: 'DELETE' });
}

describe('Category delete — cascade orphan file cleanup (I-212)', () => {
  it('deletes the category image AND every product image the cascade takes down with it', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(IMG_CATEGORY);
      await writeFixture(IMG_SKU_1);
      await writeFixture(IMG_SKU_2);
      await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد', imageUrl: `/uploads/${IMG_CATEGORY}` });
      await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
      await db.insert(schema.skus).values([
        { id: 'k1', slug: 'k1', name: 'کالا ۱', categoryId: 'c1', subCategoryId: 's1', unit: 'kg', imageUrl: `/uploads/${IMG_SKU_1}` },
        { id: 'k2', slug: 'k2', name: 'کالا ۲', categoryId: 'c1', subCategoryId: 's1', unit: 'kg', imageUrl: `/uploads/${IMG_SKU_2}` },
      ]);

      const res = await DELETE(deleteReq('c1'), { params: Promise.resolve({ id: 'c1' }) });
      expect(res.status).toBe(200);

      const remaining = await fs.readdir(tmpDir);
      expect(remaining).not.toContain(IMG_CATEGORY);
      expect(remaining).not.toContain(IMG_SKU_1);
      expect(remaining).not.toContain(IMG_SKU_2);
    } finally {
      await close();
    }
  });

  it('does not delete a cascaded SKU image if an unrelated, still-live SKU elsewhere shares the same file', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(IMG_SKU_1);
      await db.insert(schema.categories).values([
        { id: 'c1', slug: 'c1', name: 'میلگرد' },
        { id: 'c2', slug: 'c2', name: 'ورق' },
      ]);
      await db.insert(schema.subCategories).values([
        { id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' },
        { id: 's2', categoryId: 'c2', slug: 's2', name: 'رول' },
      ]);
      await db.insert(schema.skus).values([
        { id: 'k1', slug: 'k1', name: 'کالا ۱', categoryId: 'c1', subCategoryId: 's1', unit: 'kg', imageUrl: `/uploads/${IMG_SKU_1}` },
        { id: 'k2', slug: 'k2', name: 'کالا ۲ (دستهٔ دیگر)', categoryId: 'c2', subCategoryId: 's2', unit: 'kg', imageUrl: `/uploads/${IMG_SKU_1}` },
      ]);

      const res = await DELETE(deleteReq('c1'), { params: Promise.resolve({ id: 'c1' }) });
      expect(res.status).toBe(200);
      // k2 (untouched, in c2) still needs this file.
      expect(await fs.readdir(tmpDir)).toContain(IMG_SKU_1);
    } finally {
      await close();
    }
  });
});
