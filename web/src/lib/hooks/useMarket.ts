'use client';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { CONSTANTS } from '@/lib/config/constants';

/**
 * Ticker «نبض بازار» — polls every TICKER_REFRESH (acceptance-criteria §A).
 *
 * The market resource is imported DYNAMICALLY inside the query function. It
 * validates responses with zod, and a static import therefore put zod — 56 kB
 * raw — into the first-load bundle of EVERY page, since this hook feeds the
 * site-wide ticker. The first poll only happens after hydration, so loading
 * that chunk on demand costs the user nothing while taking 56 kB off the
 * critical path. The validation itself is unchanged.
 */
export function useMarket() {
  return useQuery({
    queryKey: queryKeys.market(),
    queryFn: async ({ signal }) => {
      const { marketApi } = await import('@/lib/api/resources/market');
      return marketApi.list({ signal });
    },
    refetchInterval: CONSTANTS.TICKER_REFRESH_SECONDS * 1000,
    staleTime: CONSTANTS.TICKER_REFRESH_SECONDS * 1000,
  });
}
