// @vitest-environment node
/**
 * The `/api/admin/catalog/factory-order` handlers, called directly on pglite —
 * the same shape as adminApi.test.ts, kept in its own file so two agents
 * editing catalog tests don't collide on one.
 *
 * What matters here is what the repo tests can't see: that the route refuses
 * an unscoped request instead of guessing a category, that it normalizes the
 * Arabic/Persian letter forms an Excel paste carries (an un-normalized name
 * stores a row that can never match the SKUs it exists to order), and that
 * a sales user — who can read the panel — cannot rearrange the shop window.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import { factoryOrderForCategory } from '@/lib/server/repos/catalogRepo';
import type { AdminFactoryOrderRow } from '@/lib/api/resources/admin';

let db: Db;
let close: () => Promise<void>;

async function authedReq(
  url: string,
  opts: { method?: string; body?: unknown; role?: 'customer' | 'sales' | 'catalog' | 'admin'; mobile: string } = {
    mobile: '09120000000',
  },
) {
  const role = opts.role ?? 'admin';
  const user = (await userByMobile(opts.mobile)) ?? (await createUser({ mobile: opts.mobile, role }));
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

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '', isActive: true },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-rebar', categoryId: 'c-rebar', slug: 'deformed', name: 'آجدار', order: 1, isActive: true },
  ]);
  await db.insert(schema.skus).values([
    {
      id: 'r1',
      subCategoryId: 's-rebar',
      categoryId: 'c-rebar',
      slug: 'r1',
      name: 'میلگرد ۱۴',
      factory: 'نیشابور',
      unit: 'kg' as const,
      isActive: true,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('GET /api/admin/catalog/factory-order', () => {
  it('refuses to answer without a category rather than returning a flat list', async () => {
    const { GET } = await import('@/app/api/admin/catalog/factory-order/route');
    const res = await GET(await authedReq('/api/admin/catalog/factory-order', { mobile: '09121200001' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('category_required');
  });

  it('returns the category factories with their order', async () => {
    const { GET, PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { categoryId: 'c-rebar', factories: ['نیشابور'] },
        mobile: '09121200001',
      }),
    );
    const res = await GET(
      await authedReq('/api/admin/catalog/factory-order?categoryId=c-rebar', { mobile: '09121200001' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { factories: AdminFactoryOrderRow[] };
    expect(body.factories).toEqual([{ factory: 'نیشابور', order: 1, skuCount: 1 }]);
  });
});

describe('PUT /api/admin/catalog/factory-order', () => {
  it('normalizes Arabic letter forms so the row can match its SKUs', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    // Arabic ي, visually identical to Persian ی and never ILIKE-equal to it.
    const res = await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { categoryId: 'c-rebar', factories: ['نيشابور'] },
        mobile: '09121200001',
      }),
    );
    expect(res.status).toBe(200);
    expect(await factoryOrderForCategory('rebar')).toEqual(['نیشابور']);
  });

  it('rejects a body with no categoryId', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { factories: ['نیشابور'] },
        mobile: '09121200001',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('lets a read-only role look but not rearrange', async () => {
    const { GET, PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    const read = await GET(
      await authedReq('/api/admin/catalog/factory-order?categoryId=c-rebar', {
        role: 'sales',
        mobile: '09121200002',
      }),
    );
    expect(read.status).toBe(200);
    const write = await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { categoryId: 'c-rebar', factories: ['نیشابور'] },
        role: 'sales',
        mobile: '09121200002',
      }),
    );
    // 404, not 403 — requireApiPermission hides every admin endpoint the
    // caller may not use, rather than confirming it exists.
    expect(write.status).toBe(404);
  });

  it('hides the endpoint from a customer entirely', async () => {
    const { PUT } = await import('@/app/api/admin/catalog/factory-order/route');
    const res = await PUT(
      await authedReq('/api/admin/catalog/factory-order', {
        method: 'PUT',
        body: { categoryId: 'c-rebar', factories: ['نیشابور'] },
        role: 'customer',
        mobile: '09121200003',
      }),
    );
    expect(res.status).toBe(404);
  });
});
