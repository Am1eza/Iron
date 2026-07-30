import { API_MODE } from '../config';
import { http } from '../http';

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
