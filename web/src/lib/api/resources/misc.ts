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
