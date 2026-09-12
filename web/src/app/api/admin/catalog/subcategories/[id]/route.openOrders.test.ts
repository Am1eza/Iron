// @vitest-environment node
/**
 * G-164 (sub-category cascade path): the same atomic open-order guard the
 * SKU delete routes got (`deleteSubCategoryGuarded`, replacing the old
 * two-query `subCategoryImpact()` + `deleteSubCategory()`) — this proves the
 * route wires it correctly: blocked without override, deletes with it.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'catalog-1', role: 'catalog' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));
import { DELETE } from './route';

function deleteReq(id: string, override = false) {
  const url = `http://localhost/api/admin/catalog/subcategories/${id}${override ? '?override=true' : ''}`;
  return new NextRequest(url, { method: 'DELETE' });
}

describe('DELETE /api/admin/catalog/subcategories/[id] — open-order guard, real DB (G-164)', () => {
  it('blocks the cascade when a product under it has an open order, unless override=true', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { eq } = await import('drizzle-orm');
    const { db, close } = await createTestDb();
    try {
      await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد' });
      await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
      await db.insert(schema.skus).values({
        id: 'sku-open', slug: 'sku-open', name: 'کالای سفارش‌دار', size: '14', categoryId: 'c1', subCategoryId: 's1', unit: 'kg',
      });
      await db.insert(schema.orders).values({ id: 'o1', ref: 'OR-1', status: 'registered' });
      await db.insert(schema.orderItems).values({
        id: 'oi1', orderId: 'o1', skuId: 'sku-open', name: 'کالای سفارش‌دار', qty: 1, unit: 'kg',
      });

      const blocked = await DELETE(deleteReq('s1'), { params: Promise.resolve({ id: 's1' }) });
      expect(blocked.status).toBe(409);
      expect((await blocked.json()).error).toBe('open_orders');
      expect((await db.select().from(schema.subCategories).where(eq(schema.subCategories.id, 's1'))).length).toBe(1);

      const ok = await DELETE(deleteReq('s1', true), { params: Promise.resolve({ id: 's1' }) });
      expect(ok.status).toBe(200);
      expect(await db.select().from(schema.subCategories)).toHaveLength(0);
      expect(await db.select().from(schema.skus)).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it('404s on an id that does not exist, guard or not', async () => {
    const { createTestDb } = await import('@/test/db');
    const { close } = await createTestDb();
    try {
      const res = await DELETE(deleteReq('nonexistent'), { params: Promise.resolve({ id: 'nonexistent' }) });
      expect(res.status).toBe(404);
    } finally {
      await close();
    }
  });
});
