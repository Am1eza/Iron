// @vitest-environment node
/**
 * G-164: a bulk-destructive endpoint must cap how much damage one request
 * can do. This route already had the cap (MAX_BULK_DELETE = 200, enforced by
 * the Zod schema before anything touches the DB) — this test exists so a
 * future edit that raises/removes it fails CI instead of only being caught
 * by manual review.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'catalog-1', role: 'catalog' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));
import { POST } from './route';

function req(ids: string[]) {
  return new NextRequest('http://localhost/api/admin/catalog/skus/bulk-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

describe('POST /api/admin/catalog/skus/bulk-delete — row cap (G-164)', () => {
  it('rejects a batch of 201 ids — one over the cap', async () => {
    const res = await POST(req(Array.from({ length: 201 }, (_, i) => `sku-${i}`)));
    expect(res.status).toBe(400);
  });

  it('rejects an empty batch (nothing to confirm/delete)', async () => {
    const res = await POST(req([]));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/catalog/skus/bulk-delete — open-order guard, real DB (G-164)', () => {
  it('blocks a batch containing a SKU on an open order unless override=true, then actually deletes on override', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { eq } = await import('drizzle-orm');
    const { db, close } = await createTestDb();
    try {
      await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد' });
      await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
      await db.insert(schema.skus).values([
        { id: 'sku-open', slug: 'sku-open', name: 'کالای سفارش‌دار', size: '14', categoryId: 'c1', subCategoryId: 's1', unit: 'kg' },
        { id: 'sku-free', slug: 'sku-free', name: 'کالای آزاد', size: '16', categoryId: 'c1', subCategoryId: 's1', unit: 'kg' },
      ]);
      await db.insert(schema.orders).values({ id: 'o1', ref: 'OR-1', status: 'registered' });
      await db.insert(schema.orderItems).values({
        id: 'oi1', orderId: 'o1', skuId: 'sku-open', name: 'کالای سفارش‌دار', qty: 1, unit: 'kg',
      });

      // Without override: the whole batch is blocked, including the free SKU
      // riding along with it — nothing deleted at all.
      const blocked = await POST(req(['sku-open', 'sku-free']));
      expect(blocked.status).toBe(409);
      const blockedBody = await blocked.json();
      expect(blockedBody.error).toBe('open_orders');
      expect(blockedBody.blockedIds).toEqual(['sku-open']);
      expect((await db.select().from(schema.skus).where(eq(schema.skus.id, 'sku-free'))).length).toBe(1);

      // With override=true: the batch actually proceeds and both are gone.
      const overrideReq = new NextRequest('http://localhost/api/admin/catalog/skus/bulk-delete?override=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['sku-open', 'sku-free'] }),
      });
      const ok = await POST(overrideReq);
      expect(ok.status).toBe(200);
      const okBody = await ok.json();
      expect(okBody.removedCount).toBe(2);
      expect(await db.select().from(schema.skus)).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
