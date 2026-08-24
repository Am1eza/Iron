import { API_MODE } from '../config';
import { http } from '../http';
import { categories as mockCategories, rebarRows } from '@/lib/mock/fixtures';
import { priceSeries as mockPriceSeries, getRows as mockGetRows } from '@/lib/mock/catalogData';
import type { Article, Category, PriceRow } from '@/lib/types/domain';

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

  /** Every row in one category, unfiltered by sub — CostCalculator's product
   *  picker is a single category dropdown across the whole catalog rather than
   *  a URL-scoped category+sub like the `/prices` pages, so it needs this
   *  instead of `table()`. Public endpoint, no admin gate. */
  async category(slug: string, opts?: { signal?: AbortSignal }): Promise<{ rows: PriceRow[] }> {
    if (API_MODE === 'mock') {
      await delay();
      return { rows: mockGetRows(slug) };
    }
    return http.get(`/api/categories/${encodeURIComponent(slug)}`, {
      signal: opts?.signal,
      next: { revalidate: 120 },
    });
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

  /** SearchBar's autocomplete dropdown — the same `/api/search` endpoint that
   *  already backs the /search page, already rate-limited server-side. Mock
   *  mode returns no suggestions rather than duplicating /search's own
   *  substring-scan logic client-side: the baseline Enter-to-/search path
   *  works unaffected either way (that page's mock branch is untouched by
   *  this), only the autocomplete dropdown itself has nothing to show. */
  async search(q: string, opts?: { signal?: AbortSignal }): Promise<{ skus: PriceRow[]; articles: Article[] }> {
    if (API_MODE === 'mock') return { skus: [], articles: [] };
    return http.get<{ skus: PriceRow[]; articles: Article[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
      // One attempt, no retry pile-up behind a fast typist — same reasoning
      // as the admin command palette's search() call.
      { signal: opts?.signal, retries: 0 },
    );
  },
};
