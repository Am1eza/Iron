import { API_MODE } from '../config';
import { http } from '../http';
import { parseOr } from '@/lib/validation/utils';
import { marketResponseSchema } from '@/lib/validation/api';
import { marketValues } from '@/lib/mock/fixtures';
import type { MarketValue } from '@/lib/types/domain';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

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
};
