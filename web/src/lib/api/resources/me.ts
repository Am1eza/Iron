import { http } from '../http';
import type { Order } from '@/lib/types/domain';

export interface Letterhead {
  logoUrl: string | null;
  companyName: string | null;
  address: string | null;
  phone: string | null;
}

/** The signed-in customer's own account data (as opposed to admin's view of
 *  everyone's). Currently just orders — for the live-polling shipment list
 *  (OrdersListLive); other /account tabs stay server-rendered-once since
 *  nothing else on that page changes out from under the customer mid-visit.
 *  `letterhead.*` is the exception (پولادی-tier custom پیش‌فاکتور letterhead,
 *  US-tender-letterhead) — genuinely edited client-side in /account/club. */
export const meApi = {
  orders: () => http.get<{ orders: Order[]; page: number; hasMore: boolean }>('/api/me/orders'),
  letterhead: {
    get: () => http.get<{ letterhead: Letterhead | null }>('/api/me/letterhead'),
    update: (data: { companyName?: string; address?: string; phone?: string }) =>
      http.put<{ letterhead: Letterhead }>('/api/me/letterhead', data),
    uploadLogo: (file: File) => http.upload<{ url: string }>('/api/me/letterhead/logo', file),
  },
};
