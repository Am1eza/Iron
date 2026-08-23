// @vitest-environment node
/**
 * Regression for the 2026-08-23 fabricated-history bug.
 *
 * `catalog.priceSeries()` used to end with:
 *
 *     if (points.length === 0) return mock.priceSeries(skuSlug, currentPrice, days);
 *
 * — inside the LIVE branch. `mock.priceSeries` is a seeded random walk, so any
 * product with no `price_points` published a full invented series on its public
 * page, generated per request, captioned with two of its own invented numbers.
 * It fired on every never-priced SKU (7 of them before the seed-data repair, 85
 * after it) on a site whose proposition is price transparency.
 *
 * The contract now: in live mode the series is exactly what the database holds,
 * empty included. The mock fallback survives only for mock mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type * as CatalogRepo from '@/lib/server/repos/catalogRepo';
import type * as DbClient from '@/lib/server/db/client';
import type * as MockCatalog from '@/lib/mock/catalogData';

const skuHistory = vi.fn<(slug: string, range?: string) => Promise<Array<{ price: number }>>>();
const mockPriceSeries = vi.fn<(slug: string, price: number, days?: number) => number[]>(() => [1, 2, 3]);

vi.mock('@/lib/api/config', () => ({ API_MODE: 'live' }));
vi.mock('@/lib/server/db/client', async (orig) => ({
  ...((await orig()) as typeof DbClient),
  hasDb: () => true,
}));
vi.mock('@/lib/server/repos/catalogRepo', async (orig) => ({
  ...((await orig()) as typeof CatalogRepo),
  skuHistory,
}));
vi.mock('@/lib/mock/catalogData', async (orig) => ({
  ...((await orig()) as typeof MockCatalog),
  priceSeries: mockPriceSeries,
}));

const { priceSeries } = await import('@/lib/server/catalog');

beforeEach(() => {
  skuHistory.mockReset();
  mockPriceSeries.mockClear();
});

describe('catalog.priceSeries in live mode', () => {
  it('returns an empty series for a SKU with no history, and never invents one', async () => {
    skuHistory.mockResolvedValue([]);
    await expect(priceSeries('pipe-gas-3', 0, 90)).resolves.toEqual([]);
    expect(mockPriceSeries).not.toHaveBeenCalled();
  });

  it('still returns the real points when there are some', async () => {
    skuHistory.mockResolvedValue([{ price: 68_364 }, { price: 68_900 }]);
    await expect(priceSeries('rebar-deformed-9', 68_900, 30)).resolves.toEqual([68_364, 68_900]);
    expect(mockPriceSeries).not.toHaveBeenCalled();
  });
});
