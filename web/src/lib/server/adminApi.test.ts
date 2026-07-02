// @vitest-environment node
/**
 * P6 integration — the admin API permission matrix and the pricing/billet
 * write paths, exercised by calling the route handlers directly on pglite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Route handlers read the session via next/headers cookies(), which needs a
// request async-context. Back it with a test-scoped variable instead.
let cookieToken: string | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieToken && name === 'ahantime_at' ? { name, value: cookieToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import type { Db } from '@/lib/server/db/client';
import { createUser } from '@/lib/auth/store';
import { signAccessToken } from '@/lib/auth/jwt';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { ACCESS_COOKIE } from '@/lib/auth/session';

let db: Db;
let close: () => Promise<void>;

async function authedReq(
  url: string,
  opts: { method?: string; body?: unknown; role?: 'customer' | 'operator' | 'sales' | 'admin'; mobile?: string } = {},
) {
  const role = opts.role ?? 'admin';
  const mobile = opts.mobile ?? `0912${String(Math.abs(role.length * 1111111)).padStart(7, '0')}`;
  const { userByMobile } = await import('@/lib/auth/store');
  const user = (await userByMobile(mobile)) ?? (await createUser({ mobile, role }));
  const { token } = await signAccessToken({ sub: user.id, mobile: user.mobile, role: user.role });
  cookieToken = token;
  const headers: Record<string, string> = {
    cookie: `${ACCESS_COOKIE}=${token}`,
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
    host: 'localhost:3000',
  };
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 2 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('permission matrix', () => {
  it('anonymous → 401, customer → 404 (hidden), operator → allowed on pricing', async () => {
    const { GET } = await import('@/app/api/admin/pricing/route');

    cookieToken = null;
    const anon = new NextRequest('http://localhost:3000/api/admin/pricing?cat=rebar');
    expect((await GET(anon)).status).toBe(401);

    const customer = await authedReq('/api/admin/pricing?cat=rebar', { role: 'customer', mobile: '09121000001' });
    expect((await GET(customer)).status).toBe(404); // hide, don't reveal

    const operator = await authedReq('/api/admin/pricing?cat=rebar', { role: 'operator', mobile: '09121000002' });
    const ok = await GET(operator);
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { rows: unknown[] };
    expect(data.rows.length).toBeGreaterThan(0);
  });

  it('operator cannot read leads (sales-only)', async () => {
    const { GET } = await import('@/app/api/admin/leads/route');
    const operator = await authedReq('/api/admin/leads', { role: 'operator', mobile: '09121000002' });
    expect((await GET(operator)).status).toBe(404);
    const sales = await authedReq('/api/admin/leads', { role: 'sales', mobile: '09121000003' });
    expect((await GET(sales)).status).toBe(200);
  });
});

describe('admin writes', () => {
  it('bulk price save persists movement and audits', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[0]!;
    const { PUT } = await import('@/app/api/admin/pricing/route');
    const req = await authedReq('/api/admin/pricing', {
      method: 'PUT',
      role: 'admin',
      mobile: '09120000000',
      body: { prices: [{ skuId: sku.id, price: sku.current.price + 2000, deliveryTime: '۴۸ ساعت' }] },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: Array<{ movementDir: string }> };
    expect(data.results[0]!.movementDir).toBe('up');

    const fresh = await tableRows('rebar');
    expect(fresh.find((r) => r.id === sku.id)!.current.price).toBe(sku.current.price + 2000);
  });

  it('billet PUT updates the admin-sourced ticker value', async () => {
    const { PUT } = await import('@/app/api/admin/market/billet/route');
    const req = await authedReq('/api/admin/market/billet', {
      method: 'PUT',
      role: 'admin',
      mobile: '09120000000',
      body: { value: 300000 },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const { listMarketValues } = await import('@/lib/server/repos/marketRepo');
    const billet = (await listMarketValues()).find((v) => v.key === 'billet')!;
    expect(billet.value).toBe(300000);
    expect(billet.source).toBe('admin');
  });

  it('last-admin demotion is refused with 409', async () => {
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const { userByMobile } = await import('@/lib/auth/store');
    const admin = await userByMobile('09120000000');
    const req = await authedReq(`/api/admin/users/${admin!.id}`, {
      method: 'PATCH',
      role: 'admin',
      mobile: '09120000000',
      body: { role: 'sales' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: admin!.id }) });
    expect(res.status).toBe(409);
  });
});
