// @vitest-environment node
/**
 * G-159 follow-up: PATCH /api/admin/users/[id]'s last-admin guard, proven
 * against a real DB (not mocked) — including the isActive-filtering fix
 * (an already-inactive admin row must not count toward "how many active
 * admins exist"). The concurrent-race variant of this same guard is proven
 * separately against real PostgreSQL in scripts/lastAdminUsersRaceProbe.ts
 * (PGlite has no real connection pool, so it cannot exercise genuine
 * concurrency the way that script's two live connections can).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type * as ApiGuard from '@/lib/server/utils/apiGuard';

vi.mock('@/lib/server/utils/apiGuard', async (importOriginal) => {
  // withApiErrorHandling is what converts a thrown BusinessRuleError('last_admin', ...)
  // into the actual 409 JSON response this test asserts on — keep the REAL
  // one, only stub the auth-specific pieces.
  const actual = await importOriginal<typeof ApiGuard>();
  return {
    ...actual,
    requireDb: () => null,
    requireApiPermission: async () => ({ session: { id: 'actor-admin', role: 'admin' } }),
    audit: async () => {},
  };
});
import { PATCH } from './route';

let close: () => Promise<void>;
let db: Awaited<ReturnType<typeof createTestDb>>['db'];
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

function patch(id: string, body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(`http://localhost/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe('PATCH /api/admin/users/[id] — last-admin guard (G-159)', () => {
  it('deactivating one of two active admins succeeds', async () => {
    await db.insert(schema.users).values([
      { id: 'admin-x', mobile: '09121110021', role: 'admin', isActive: true },
      { id: 'admin-y', mobile: '09121110022', role: 'admin', isActive: true },
    ]);
    const res = await patch('admin-x', { isActive: false });
    expect(res.status).toBe(200);
  });

  it('deactivating the LAST active admin is blocked with 409 last_admin', async () => {
    // Only admin-y is active now (admin-x deactivated above).
    const res = await patch('admin-y', { isActive: false });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('last_admin');
  });

  it('an already-inactive admin row does not inflate the count — deactivating the true last ACTIVE admin is still blocked even with a second, already-inactive admin row present', async () => {
    // admin-x is already inactive (from the first test). admin-y is the only
    // active admin. This must still be blocked, not incorrectly allowed
    // because "2 rows have role=admin".
    const res = await patch('admin-y', { isActive: false });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('last_admin');
  });
});
