'use client';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { api } from '@/lib/api';
import { CONSTANTS } from '@/lib/config/constants';

/** Ticker «نبض بازار» — polls every TICKER_REFRESH (acceptance-criteria §A). */
export function useMarket() {
  return useQuery({
    queryKey: queryKeys.market(),
    queryFn: ({ signal }) => api.market.list({ signal }),
    refetchInterval: CONSTANTS.TICKER_REFRESH_SECONDS * 1000,
    staleTime: CONSTANTS.TICKER_REFRESH_SECONDS * 1000,
  });
}
