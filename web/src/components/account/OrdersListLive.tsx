'use client';
/**
 * Polls «سفارش‌های من» so a status/tracking change a rep makes shows up
 * without the customer reloading — this tab's own sub-copy has always
 * promised "وضعیت لحظه‌ای" (live status); until now the list was fetched once
 * per page load by the server component and never again, so the promise was
 * false the moment the customer left the tab open.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types/domain';
import { OrdersList } from './OrdersList';

// Frequent enough to feel live, far below anything that would trouble the
// API for a low-traffic page a customer keeps open while waiting on a
// shipment. Pauses automatically when the tab isn't visible (TanStack
// Query's default) so it costs nothing while backgrounded.
const POLL_MS = 20_000;

export function OrdersListLive({ initialOrders }: { initialOrders: Order[] }) {
  const { data } = useQuery({
    queryKey: ['me', 'orders'],
    queryFn: () => api.me.orders(),
    initialData: { orders: initialOrders, page: 1, hasMore: false },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  return <OrdersList orders={data.orders} />;
}
