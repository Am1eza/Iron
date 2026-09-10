// @vitest-environment node
/**
 * I-212 — the SKU delete/replace routes must actually remove the image file
 * they were the only reference to, and must NEVER remove one another live
 * row still needs. Real pglite DB (createTestDb) + a real temp directory
 * standing in for `uploadDir()`, so this proves the on-disk effect, not just
 * that a function was called.
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-sku-upload-cleanup-'));
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

const IMG_A = '01H0000000000000000000000A.jpg';
const IMG_B = '01H0000000000000000000000B.jpg';

import { PATCH, DELETE } from './route';

function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/catalog/skus/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/admin/catalog/skus/${id}`, { method: 'DELETE' });
}

describe('SKU delete/replace — orphan file cleanup (I-212)', () => {
  it('replacing a SKU image deletes the old file from disk once nothing else references it', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(IMG_A);
      await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد' });
      await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
      await db.insert(schema.skus).values({
        id: 'k1', slug: 'k1', name: 'کالا ۱', categoryId: 'c1', subCategoryId: 's1', unit: 'kg',
        imageUrl: `/uploads/${IMG_A}`,
      });

      const res = await PATCH(patchReq('k1', { imageUrl: `/uploads/${IMG_B}` }), {
        params: Promise.resolve({ id: 'k1' }),
      });
      expect(res.status).toBe(200);
      expect(await fs.readdir(tmpDir)).not.toContain(IMG_A);
    } finally {
      await close();
    }
  });

  it('deleting a SKU deletes its image from disk', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(IMG_A);
      await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد' });
      await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
      await db.insert(schema.skus).values({
        id: 'k1', slug: 'k1', name: 'کالا ۱', categoryId: 'c1', subCategoryId: 's1', unit: 'kg',
        imageUrl: `/uploads/${IMG_A}`,
      });

      const res = await DELETE(deleteReq('k1'), { params: Promise.resolve({ id: 'k1' }) });
      expect(res.status).toBe(200);
      expect(await fs.readdir(tmpDir)).not.toContain(IMG_A);
    } finally {
      await close();
    }
  });

  it('deleting a SKU does NOT delete its image if another live SKU still points at the exact same file', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(IMG_A);
      await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد' });
      await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
      await db.insert(schema.skus).values([
        { id: 'k1', slug: 'k1', name: 'کالا ۱', categoryId: 'c1', subCategoryId: 's1', unit: 'kg', imageUrl: `/uploads/${IMG_A}` },
        { id: 'k2', slug: 'k2', name: 'کالا ۲', categoryId: 'c1', subCategoryId: 's1', unit: 'kg', imageUrl: `/uploads/${IMG_A}` },
      ]);

      const res = await DELETE(deleteReq('k1'), { params: Promise.resolve({ id: 'k1' }) });
      expect(res.status).toBe(200);
      // k2 still needs it — must survive.
      expect(await fs.readdir(tmpDir)).toContain(IMG_A);
    } finally {
      await close();
    }
  });
});
