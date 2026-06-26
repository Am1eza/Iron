import { API_MODE } from '../config';
import { http } from '../http';
import { categories as mockCategories, rebarRows } from '@/lib/mock/fixtures';
import type { Category, PriceRow } from '@/lib/types/domain';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

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
};
