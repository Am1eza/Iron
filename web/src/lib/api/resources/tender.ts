import { http } from '../http';
import type { FactoryOption, TenderQuote } from '@/lib/server/services/tenderEstimate';

/** Client for the برآورد مناقصات tool. Pricing/options are always resolved
 *  server-side (see /api/tender/*) — this only shuttles the request. */
export const tenderApi = {
  options(params: { category: string; sub: string; size?: string }): Promise<{ sizes: string[]; factories: FactoryOption[] }> {
    const q = new URLSearchParams({ category: params.category, sub: params.sub });
    if (params.size) q.set('size', params.size);
    return http.get(`/api/tender/options?${q.toString()}`);
  },
  price(items: { skuId: string; qty: number }[]): Promise<TenderQuote> {
    return http.post('/api/tender/price', { items });
  },
};
