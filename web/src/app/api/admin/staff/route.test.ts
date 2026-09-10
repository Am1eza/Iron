// @vitest-environment node
/**
 * G-156: this endpoint is gated on `leads:write` (any sales rep holds it),
 * so the full staff mobile roster — including the system admin's — must not
 * be readable by a role that only needs it as a fallback display label (see
 * LeadsTab.tsx/LeadDetail.tsx: `name ?? mobile`). Only `users:manage` (admin)
 * gets the real number; everyone else gets it masked to the last 4 digits.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';

let sessionRole: 'admin' | 'sales' = 'sales';
vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'actor', role: sessionRole } }),
  withApiErrorHandling: (handler: unknown) => handler,
}));
import { GET } from './route';

let close: () => Promise<void>;
beforeAll(async () => {
  const test = await createTestDb();
  close = test.close;
  await test.db.insert(schema.users).values([
    { id: 'admin-1', mobile: '09121234567', name: null, role: 'admin', isActive: true },
    { id: 'sales-1', mobile: '09359876543', name: 'کارشناس نمونه', role: 'sales', isActive: true },
  ]);
}, 30000);
afterAll(async () => {
  await close();
});

function req() {
  return new NextRequest('http://localhost/api/admin/staff');
}

describe('GET /api/admin/staff — mobile visibility by role', () => {
  it('masks every mobile to the last 4 digits for a requester without users:manage', async () => {
    sessionRole = 'sales';
    const body = await (await GET(req())).json();
    const admin = body.staff.find((s: { id: string }) => s.id === 'admin-1');
    expect(admin.mobile).toBe('0912***4567');
    expect(admin.mobile).not.toBe('09121234567');
  });

  it('still gives a masked-but-distinguishing fallback label — no two staff collapse to the same string', async () => {
    sessionRole = 'sales';
    const body = await (await GET(req())).json();
    const masked = body.staff.map((s: { mobile: string }) => s.mobile);
    expect(new Set(masked).size).toBe(masked.length);
  });

  it('returns the real, unmasked mobile for a requester WITH users:manage (admin)', async () => {
    sessionRole = 'admin';
    const body = await (await GET(req())).json();
    const admin = body.staff.find((s: { id: string }) => s.id === 'admin-1');
    expect(admin.mobile).toBe('09121234567');
  });

  it('sets Cache-Control: no-store (G-170)', async () => {
    const res = await GET(req());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
