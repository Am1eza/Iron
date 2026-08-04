// @vitest-environment node
/**
 * `ai:domain-facts` had NO invalidation path — its 600s TTL was the only thing
 * that ever refreshed it. This pins the wiring, not the string: the failure it
 * guards is someone adding a taxonomy write path (or "simplifying"
 * revalidateCatalog) and leaving the advisor grounded on a catalog shape that
 * no longer exists.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { cacheDel } = vi.hoisted(() => ({ cacheDel: vi.fn(async () => {}) }));
vi.mock('@/lib/server/redis', () => ({
  cacheDel,
  cacheGetJson: vi.fn(async () => null),
  cacheSetJson: vi.fn(async () => {}),
  jitterTtl: (n: number) => n,
}));

import { revalidateCatalog } from './catalogRoute';
import { DOMAIN_FACTS_CACHE_KEY } from '@/lib/server/ai/domainFacts';

beforeEach(() => {
  cacheDel.mockClear();
});

describe('revalidateCatalog — AI domain-facts invalidation', () => {
  it('drops the cached facts on a taxonomy write', async () => {
    await revalidateCatalog('taxonomy');
    expect(cacheDel).toHaveBeenCalledWith(DOMAIN_FACTS_CACHE_KEY);
  });

  it('does NOT pay for the round trip on a SKU write', async () => {
    // The facts string carries category/sub-category names only, so no product
    // edit can change it. Busting here would add a Redis hit to the hottest
    // admin write path for nothing.
    await revalidateCatalog('sku');
    expect(cacheDel).not.toHaveBeenCalled();
  });

  it('never throws when the cache layer is unavailable — the write is already committed', async () => {
    cacheDel.mockRejectedValueOnce(new Error('redis down'));
    // The category was already saved. Failing the admin's request to report a
    // stale cache entry would have them retry into the unique-slug index.
    await expect(revalidateCatalog('taxonomy')).resolves.toBeUndefined();
  });
});
