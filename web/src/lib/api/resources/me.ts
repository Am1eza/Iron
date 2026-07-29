import { http } from '../http';
import type { Order } from '@/lib/types/domain';

/** The signed-in customer's own account data (as opposed to admin's view of
 *  everyone's). Currently just orders — for the live-polling shipment list
 *  (OrdersListLive); other /account tabs stay server-rendered-once since
 *  nothing else on that page changes out from under the customer mid-visit. */
export const meApi = {
  orders: () => http.get<{ orders: Order[]; page: number; hasMore: boolean }>('/api/me/orders'),
};
