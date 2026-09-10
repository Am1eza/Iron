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
