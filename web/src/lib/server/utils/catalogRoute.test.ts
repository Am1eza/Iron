// @vitest-environment node
/**
 * `ai:domain-facts` had NO invalidation path — its 600s TTL was the only thing
 * that ever refreshed it. This pins the wiring, not the string: the failure it
 * guards is someone adding a catalog write path (or "simplifying"
 * revalidateCatalog) and leaving the advisor grounded on a catalog shape that
 * no longer exists.
 *
 * BOTH scopes drop it. The SKU scope is here because these facts are not only
 * taxonomy names — see the second test.
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

  it('drops them on a SKU write too — the facts contain grades, which come from skus', async () => {
    // This test used to assert the OPPOSITE, on the stated grounds that "the
    // facts string carries category/sub-category names only, so no product
    // edit can change it". `getDomainFacts` also injects `gradesByCategory()`
    // — `SELECT DISTINCT grade FROM skus` — under the sentence «هیچ کد گرید
    // دیگری وجود ندارد؛ اگر گریدی در این فهرست نیست، نامش را نساز و نگو». So
    // for ten minutes after the first B500C product was added the advisor told
    // customers that grade does not exist, and for ten minutes after the last
    // one was deleted it kept offering it. One Redis DEL is not a cost worth
    // that.
    await revalidateCatalog('sku');
    expect(cacheDel).toHaveBeenCalledWith(DOMAIN_FACTS_CACHE_KEY);
  });

  it('never throws on a SKU write either when the cache layer is unavailable', async () => {
    cacheDel.mockRejectedValueOnce(new Error('redis down'));
    await expect(revalidateCatalog('sku')).resolves.toBeUndefined();
  });

  it('never throws when the cache layer is unavailable — the write is already committed', async () => {
    cacheDel.mockRejectedValueOnce(new Error('redis down'));
    // The category was already saved. Failing the admin's request to report a
    // stale cache entry would have them retry into the unique-slug index.
    await expect(revalidateCatalog('taxonomy')).resolves.toBeUndefined();
  });
});
