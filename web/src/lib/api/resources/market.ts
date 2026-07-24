import { API_MODE } from '../config';
import { http } from '../http';
import { parseOr } from '@/lib/validation/utils';
import { marketResponseSchema } from '@/lib/validation/api';
import { marketValues } from '@/lib/mock/fixtures';
import { priceSeries as mockPriceSeries } from '@/lib/mock/catalogData';
import type { MarketValue } from '@/lib/types/domain';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

export const marketApi = {
  async list(opts?: { signal?: AbortSignal }): Promise<{ values: MarketValue[] }> {
    if (API_MODE === 'mock') {
      await delay();
      return { values: marketValues };
    }
    const raw = await http.get<unknown>('/api/market', { signal: opts?.signal, next: { revalidate: 60 } });
    // boundary validation → graceful fallback on bad/partial external data
    return parseOr(marketResponseSchema, raw, { values: [] });
  },
  /** Chart series for one ticker key (MarketBoard's «نمودار» panel). Public
   *  endpoint, no admin gate — mirrors the sku-history wrapper below it. */
  async history(
    key: MarketValue['key'],
    currentValue: number,
    range = '30d',
  ): Promise<{ points: Array<{ value: number; at: string }> }> {
    if (API_MODE === 'mock') {
      await delay();
      const days = RANGE_DAYS[range] ?? 30;
      return { points: mockPriceSeries('market:' + key, currentValue, days).map((value, i) => ({ value, at: String(i) })) };
    }
    return http.get<{ points: Array<{ value: number; at: string }> }>(
      `/api/market/${key}/history?range=${range}`,
    );
  },
};
