'use client';
/** Shared price-alert (قیمت‌سنج) list query (W22). One `queryKey` — React
 *  Query dedupes the network fetch across every bell trigger on a page (price
 *  rows, SKU hero, market cards) and the account list, so "is there already
 *  an alert for this row" never costs a per-row request. */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { alertsApi } from '@/lib/api/resources/misc';
import { useAuth } from './useAuth';

export function useAlerts() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.myAlerts(),
    queryFn: () => alertsApi.list(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}
