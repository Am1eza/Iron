// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type * as DbClient from '@/lib/server/db/client';

vi.mock('@/lib/api/config', () => ({ API_MODE: 'live' }));
vi.mock('@/lib/server/db/client', async (original) => ({
  ...((await original()) as typeof DbClient),
  hasDb: () => false,
}));

const catalog = await import('./catalog');

describe('catalog seam in live mode without a database', () => {
  it('fails closed instead of leaking demo taxonomy, products, prices, or articles', async () => {
    await expect(catalog.getCategories()).resolves.toEqual([]);
    await expect(catalog.getSubsMap()).resolves.toEqual({});
    await expect(catalog.getRows('wire')).resolves.toEqual([]);
    await expect(catalog.getHeadlineRows()).resolves.toEqual([]);
    await expect(catalog.findSku('rebar-deformed-1')).resolves.toBeUndefined();
    await expect(catalog.getBilletReference()).resolves.toBeNull();
    await expect(catalog.priceSeries('rebar-deformed-1', 42_000)).resolves.toEqual([]);
    await expect(catalog.getArticlesPage('blog')).resolves.toEqual({ articles: [], total: 0 });
  });
});
