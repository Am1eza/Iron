// @vitest-environment node
/**
 * The admin catalog route handlers, called directly on pglite — same shape as
 * `factoryOrderApi.pg.test.ts`, in its own file so two agents editing catalog
 * tests don't collide on one.
 *
 * What these cover is everything that happens AROUND the repo call, which is
 * where the catalog's worst behaviour lived and where nothing was tested:
 *
 *  · a delete recorded `{ name, slug }` and threw the other sixteen columns
 *    away, while holding the whole row — and there is no trash, no undo and no
 *    soft delete behind it;
 *  · a delete left no redirect and no tombstone at any of the three levels, so
 *    an indexed product URL became a bare 404;
 *  · moving a sub-category between categories changed the URL of that sub and
 *    every product under it, and the route only ever compared slugs;
 *  · a create logged the request body rather than the row, so the activity log
 *    showed a slug that had never been in the database;
 *  · `reorderTaxonomy` — one transaction, written to replace N racing PATCHes
 *    — was exported by no route at all;
 *  · `PUT /factory-order` accepted an empty list (wiping a category's whole
 *    hand-arranged order) and had no error mapping for a stale category id.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

let cookieToken: string | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieToken && name === 'ahantime_at' ? { name, value: cookieToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { createUser, userByMobile } from '@/lib/auth/store';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/session';

let db: Db;
let close: () => Promise<void>;

async function authedReq(
  url: string,
  opts: { method?: string; body?: unknown; role?: 'customer' | 'sales' | 'catalog' | 'admin'; mobile?: string } = {},
) {
  const mobile = opts.mobile ?? '09120000000';
  const role = opts.role ?? 'admin';
  const user = (await userByMobile(mobile)) ?? (await createUser({ mobile, role }));
  const { token } = await signAccessToken({ sub: user.id, mobile: user.mobile, role: user.role });
  cookieToken = token;
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? 'GET',
    headers: {
      cookie: `${ACCESS_COOKIE}=${token}`,
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function auditFor(entityId: string) {
  const rows = await db
    .select()
    .from(schema.auditEntries)
    .where(eq(schema.auditEntries.entityId, entityId));
  return rows[0];
}

async function redirectFor(fromPath: string) {
  const rows = await db.select().from(schema.redirects).where(eq(schema.redirects.fromPath, fromPath)).limit(1);
  return rows[0];
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' },
    { id: 'c-sheet', slug: 'sheet', name: 'ورق', order: 2, iconId: '' },
    { id: 'c-doomed', slug: 'doomed', name: 'رفتنی', order: 3, iconId: '' },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-deformed', categoryId: 'c-rebar', slug: 'deformed', name: 'آجدار', order: 1 },
    { id: 's-mover', categoryId: 'c-rebar', slug: 'mover', name: 'جابه‌جا‌شونده', order: 2 },
    { id: 's-doomed-sub', categoryId: 'c-rebar', slug: 'doomed-sub', name: 'زیر‌دستهٔ رفتنی', order: 3 },
    { id: 's-under-doomed', categoryId: 'c-doomed', slug: 'under-doomed', name: 'زیرِ رفتنی', order: 1 },
  ]);
  const sku = (id: string, subId: string, catId: string, extra: Record<string, unknown> = {}) => ({
    id,
    slug: id,
    subCategoryId: subId,
    categoryId: catId,
    name: `کالای ${id}`,
    unit: 'kg' as const,
    ...extra,
  });
  await db.insert(schema.skus).values([
    sku('rich-sku', 's-deformed', 'c-rebar', {
      size: '۱۴',
      grade: 'A3',
      factory: 'نیشابور',
      standard: 'ISIRI 3132',
      theoreticalWeightKg: 1.21,
      branchLengthM: 12,
      priceBasis: 'branch' as const,
      imageUrl: '/uploads/rich.png',
    }),
    sku('moving-sku', 's-mover', 'c-rebar'),
    sku('doomed-sku', 's-doomed-sub', 'c-rebar'),
    sku('under-doomed-sku', 's-under-doomed', 'c-doomed'),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('DELETE /api/admin/catalog/skus/[id]', () => {
  it('records the WHOLE removed row, not just its name and slug', async () => {
    const { DELETE } = await import('@/app/api/admin/catalog/skus/[id]/route');
    const res = await DELETE(await authedReq('/api/admin/catalog/skus/rich-sku', { method: 'DELETE' }), params('rich-sku'));
    expect(res.status).toBe(200);

    const entry = await auditFor('rich-sku');
    expect(entry?.action).toBe('catalog.sku.delete');
    // The row is gone, its price history went with it, and there is no undo:
    // this entry is the only place these values still exist.
    expect(entry?.before).toMatchObject({
      name: 'کالای rich-sku',
      slug: 'rich-sku',
      size: '۱۴',
      grade: 'A3',
      factory: 'نیشابور',
      standard: 'ISIRI 3132',
      branchLengthM: 12,
      priceBasis: 'branch',
      imageUrl: '/uploads/rich.png',
      subCategoryId: 's-deformed',
    });
  });

  it('leaves a redirect to the sub-category instead of a bare 404', async () => {
    // The deleted product's URL is usually the most-linked one it had.
    expect(await redirectFor('/prices/rebar/deformed/rich-sku')).toMatchObject({
      toPath: '/prices/rebar/deformed',
      permanent: true,
    });
  });
});

describe('PATCH /api/admin/catalog/subcategories/[id] — moving between categories', () => {
  it('redirects the sub-category page AND every product under it', async () => {
    const { PATCH } = await import('@/app/api/admin/catalog/subcategories/[id]/route');
    const res = await PATCH(
      await authedReq('/api/admin/catalog/subcategories/s-mover', {
        method: 'PATCH',
        body: { categoryId: 'c-sheet' },
      }),
      params('s-mover'),
    );
    expect(res.status).toBe(200);

    // `/prices/[category]/[sub]` embeds the parent slug, so a move changes the
    // URL exactly as a rename does — the route used to compare slugs only, and
    // every indexed URL here hard-404'd in silence.
    expect(await redirectFor('/prices/rebar/mover')).toMatchObject({ toPath: '/prices/sheet/mover' });
    expect(await redirectFor('/prices/rebar/mover/moving-sku')).toMatchObject({
      toPath: '/prices/sheet/mover/moving-sku',
    });
  });
});

describe('DELETE /api/admin/catalog/subcategories/[id]', () => {
  it('redirects the sub and its products to the parent category', async () => {
    const { DELETE } = await import('@/app/api/admin/catalog/subcategories/[id]/route');
    const res = await DELETE(
      await authedReq('/api/admin/catalog/subcategories/s-doomed-sub', { method: 'DELETE' }),
      params('s-doomed-sub'),
    );
    expect(res.status).toBe(200);
    expect(await redirectFor('/prices/rebar/doomed-sub')).toMatchObject({ toPath: '/prices/rebar' });
    // The product cascaded away with its parent; its URL did not.
    expect(await redirectFor('/prices/rebar/doomed-sub/doomed-sku')).toMatchObject({ toPath: '/prices/rebar' });
    expect((await auditFor('s-doomed-sub'))?.before).toMatchObject({ slug: 'doomed-sub', categoryId: 'c-rebar' });
  });
});

describe('DELETE /api/admin/catalog/categories/[id]', () => {
  it('redirects the category, its subs and their products to the price index', async () => {
    const { DELETE } = await import('@/app/api/admin/catalog/categories/[id]/route');
    const res = await DELETE(
      await authedReq('/api/admin/catalog/categories/c-doomed', { method: 'DELETE' }),
      params('c-doomed'),
    );
    expect(res.status).toBe(200);
    expect(await redirectFor('/prices/doomed')).toMatchObject({ toPath: '/prices' });
    expect(await redirectFor('/prices/doomed/under-doomed')).toMatchObject({ toPath: '/prices' });
    expect(await redirectFor('/prices/doomed/under-doomed/under-doomed-sku')).toMatchObject({ toPath: '/prices' });
    expect((await auditFor('c-doomed'))?.before).toMatchObject({ slug: 'doomed', name: 'رفتنی' });
  });
});

describe('POST /api/admin/catalog/skus', () => {
  it('audits the row that was persisted, not the body that was sent', async () => {
    const { POST } = await import('@/app/api/admin/catalog/skus/route');
    const res = await POST(
      await authedReq('/api/admin/catalog/skus', {
        method: 'POST',
        // `rich-sku` is deleted by now, but its slug rule still applies to any
        // collision: what matters is that the log records what EXISTS.
        body: { subCategoryId: 's-deformed', slug: 'brand-new', name: 'میلگرد تازه' },
      }),
    );
    expect(res.status).toBe(201);
    const { sku } = (await res.json()) as { sku: { id: string; slug: string; categoryId: string } };
    const entry = await auditFor(sku.id);
    expect(entry?.action).toBe('catalog.sku.create');
    // `categoryId` is derived by the repo and is absent from the request body
    // entirely — its presence here is what proves the row was logged.
    expect(entry?.after).toMatchObject({ id: sku.id, slug: sku.slug, categoryId: 'c-rebar' });
  });

  it('answers 409 instead of quietly making a second copy of a product', async () => {
    const { POST } = await import('@/app/api/admin/catalog/skus/route');
    const body = {
      subCategoryId: 's-deformed',
      slug: 'double-click',
      name: 'میلگرد دوبار',
      size: '۲۰',
      factory: 'ذوب آهن',
    };
    expect((await POST(await authedReq('/api/admin/catalog/skus', { method: 'POST', body }))).status).toBe(201);
    const second = await POST(await authedReq('/api/admin/catalog/skus', { method: 'POST', body }));
    expect(second.status).toBe(409);
    const payload = (await second.json()) as { error: string; existingId: string };
    expect(payload.error).toBe('duplicate_product');
    // The id of the product that already exists, so the form can offer to open
    // it rather than leaving the admin to hunt for the row they just made.
    expect(payload.existingId).toBeTruthy();
  });
});

describe('PUT /api/admin/catalog/reorder', () => {
  it('applies a whole drag in one request and writes one audit entry', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/reorder/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/reorder', {
        method: 'PUT',
        body: {
          kind: 'category',
          items: [
            { id: 'c-sheet', order: 1 },
            { id: 'c-rebar', order: 2 },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, count: 2 });

    const cats = await db.select().from(schema.categories);
    expect(cats.find((c) => c.id === 'c-sheet')?.order).toBe(1);
    expect(cats.find((c) => c.id === 'c-rebar')?.order).toBe(2);

    const entries = await db
      .select()
      .from(schema.auditEntries)
      .where(eq(schema.auditEntries.action, 'catalog.taxonomy.reorder'));
    // ONE entry, where the old client wrote one per row it moved.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.before).toMatchObject({ kind: 'category' });
  });

  it('rejects a duplicated id rather than applying two positions to one row', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/reorder/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/reorder', {
        method: 'PUT',
        body: {
          kind: 'category',
          items: [
            { id: 'c-rebar', order: 1 },
            { id: 'c-rebar', order: 2 },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('requires the parent category when reordering sub-categories', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/reorder/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/reorder', {
        method: 'PUT',
        body: { kind: 'subCategory', items: [{ id: 's-deformed', order: 1 }] },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('category_required');
  });

  it('is not reachable by a read-only role', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/reorder/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/reorder', {
        method: 'PUT',
        body: { kind: 'category', items: [{ id: 'c-rebar', order: 9 }] },
        role: 'sales',
        mobile: '09121200099',
      }),
    );
    // 404, not 403 — requireApiPermission hides the endpoint entirely.
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/catalog/factory-order', () => {
  it('refuses an empty list instead of silently wiping the order', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { categoryId: 'c-rebar', factories: [] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('answers a stale category id with an actionable 400, not a bare 500', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { categoryId: 'c-deleted', factories: ['نیشابور'] },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_parent');
  });
});
