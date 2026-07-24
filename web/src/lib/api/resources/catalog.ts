import { API_MODE } from '../config';
import { http } from '../http';
import { categories as mockCategories, rebarRows } from '@/lib/mock/fixtures';
import { priceSeries as mockPriceSeries } from '@/lib/mock/catalogData';
import type { Category, PriceRow } from '@/lib/types/domain';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

export const catalogApi = {
  async categories(opts?: { signal?: AbortSignal }): Promise<{ categories: Category[] }> {
    if (API_MODE === 'mock') {
      await delay();
      return { categories: mockCategories };
    }
    return http.get('/api/categories', { signal: opts?.signal, next: { revalidate: 300 } });
  },

  async table(
    category: string,
    sub: string,
    opts?: { signal?: AbortSignal },
  ): Promise<{ rows: PriceRow[] }> {
    if (API_MODE === 'mock') {
      await delay();
      return { rows: rebarRows };
    }
    return http.get(
      `/api/categories/${encodeURIComponent(category)}/${encodeURIComponent(sub)}`,
      { signal: opts?.signal, next: { revalidate: 120 } },
    );
  },

  /** Price-history chart series for one SKU (PriceTable's «نمودار قیمت» modal
   *  and SKU detail page). Public endpoint, no admin gate. */
  async history(
    slug: string,
    currentPrice: number,
    range = '90d',
    opts?: { signal?: AbortSignal },
  ): Promise<{ points: Array<{ price: number; at: string }> }> {
    if (API_MODE === 'mock') {
      await delay();
      const days = RANGE_DAYS[range] ?? 90;
      return { points: mockPriceSeries(slug, currentPrice, days).map((price, i) => ({ price, at: String(i) })) };
    }
    return http.get<{ points: Array<{ price: number; at: string }> }>(
      `/api/sku/${encodeURIComponent(slug)}/history?range=${range}`,
      { signal: opts?.signal },
    );
  },
};
