import { API_MODE } from '../config';
import { http } from '../http';
import type { Alert, MarketKey, NotifyChannel } from '@/lib/types/domain';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const ok = async () => {
  await delay();
  return { ok: true } as const;
};

export const cooperationApi = {
  submit: (payload: unknown) => (API_MODE === 'mock' ? ok() : http.post<{ ok: true }>('/api/cooperation', payload)),
};

export const contactApi = {
  submit: (payload: unknown) => (API_MODE === 'mock' ? ok() : http.post<{ ok: true }>('/api/contact', payload)),
};

/** «انبار مشتریان» storage requests (W20) — live-only; WarehouseForm branches
 *  on API_MODE itself (same pattern as RequestFlow) rather than mocking here,
 *  since a real request needs to land as a real CRM lead, not a fake ok. */
export const warehouseRequestsApi = {
  submit: (payload: { product: string; quantityTons: number; duration: string; notes?: string }) =>
    http.post<{ ref: string }>('/api/warehouse-requests', payload),
};

/** Price alerts (قیمت‌سنج, W22) — live-only, matching warehouseRequestsApi:
 *  an alert is a real DB row with real cap/dedup rules server-side, not
 *  something a mock fallback can meaningfully fake. Before this file, NO
 *  client wrapper called `/api/alerts` or `/api/me/alerts` at all — the
 *  entire creation flow was unreachable from the UI despite the backend
 *  being fully built (the W22 audit's headline finding). */
export const alertsApi = {
  list: () => http.get<{ alerts: Alert[] }>('/api/me/alerts'),
  create: (payload: {
    target: { type: 'sku'; skuId: string } | { type: 'market'; key: MarketKey };
    op: 'below' | 'above';
    threshold: number;
    channel?: NotifyChannel;
  }) => http.post<{ ok: true; alert: Alert; merged: boolean }>('/api/alerts', payload),
  pause: (id: string) => http.patch<{ alert: Alert | null }>(`/api/me/alerts/${id}`, { status: 'paused' }),
  reactivate: (id: string) => http.patch<{ alert: Alert | null }>(`/api/me/alerts/${id}`, { status: 'active' }),
  remove: (id: string) => http.del<{ ok: true }>(`/api/me/alerts/${id}`),
};
