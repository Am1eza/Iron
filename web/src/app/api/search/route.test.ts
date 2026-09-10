// @vitest-environment node
/**
 * H-172: /api/search's `q` had no upper bound before it reached
 * likeContains/ILIKE — a multi-hundred-thousand-character query was accepted
 * and searched verbatim (not an injection, since it's escaped, but real CPU
 * cost on a rate-limited-but-still-public route). Same fix and precedent as
 * admin/search's `.slice(0, 100)`.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  withApiErrorHandling: (handler: unknown) => handler,
}));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));
const { searchSkusMock, searchArticlesMock } = vi.hoisted(() => ({
  searchSkusMock: vi.fn(async () => []),
  searchArticlesMock: vi.fn(async () => []),
}));
vi.mock('@/lib/server/repos/catalogRepo', () => ({ searchSkus: searchSkusMock }));
vi.mock('@/lib/server/repos/articlesRepo', () => ({ searchArticles: searchArticlesMock }));

function request(q: string) {
  return new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

describe('GET /api/search — query length cap (H-172)', () => {
  it('truncates an oversized q to 100 chars before it reaches the repo layer', async () => {
    const { GET } = await import('./route');
    const huge = 'x'.repeat(50_000);
    const res = await GET(request(huge));
    expect(res.status).toBe(200);
    expect(searchSkusMock).toHaveBeenCalledWith('x'.repeat(100));
    expect(searchArticlesMock).toHaveBeenCalledWith('x'.repeat(100));
  });

  it('leaves an ordinary short query untouched', async () => {
    const { GET } = await import('./route');
    await GET(request('میلگرد'));
    expect(searchSkusMock).toHaveBeenCalledWith('میلگرد');
    expect(searchArticlesMock).toHaveBeenCalledWith('میلگرد');
  });

  it('still rejects a too-short query (below MIN, unaffected by the cap)', async () => {
    const { GET } = await import('./route');
    searchSkusMock.mockClear();
    const res = await GET(request('a'));
    const body = await res.json();
    expect(body).toEqual({ skus: [], articles: [] });
    expect(searchSkusMock).not.toHaveBeenCalled();
  });
});
