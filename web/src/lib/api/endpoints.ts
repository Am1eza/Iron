/**
 * Typed endpoints — the seam between the UI and data.
 * In "mock" mode they resolve fixtures; in "live" mode they call /api/* (then the backend).
 * Hooks/components are identical in both modes.
 */
import { API_MODE, apiFetch } from './client';
import type { Category, MarketValue, PriceRow } from '@/lib/types/domain';
import { categories as mockCategories, marketValues, rebarRows } from '@/lib/mock/fixtures';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const endpoints = {
  async getMarket(): Promise<{ values: MarketValue[] }> {
    if (API_MODE === 'mock') {
      await delay();
      return { values: marketValues };
    }
    return apiFetch('/api/market');
  },

  async getCategories(): Promise<{ categories: Category[] }> {
    if (API_MODE === 'mock') {
      await delay();
      return { categories: mockCategories };
    }
    return apiFetch('/api/categories');
  },

  async getTable(category: string, sub: string): Promise<{ rows: PriceRow[] }> {
    if (API_MODE === 'mock') {
      await delay();
      // Single seeded sub-category for now; expanded per category as sections land.
      return { rows: rebarRows };
    }
    return apiFetch(`/api/categories/${encodeURIComponent(category)}/${encodeURIComponent(sub)}`);
  },
} as const;
