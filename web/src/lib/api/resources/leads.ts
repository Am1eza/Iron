import { API_MODE } from '../config';
import { http } from '../http';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export const leadsApi = {
  async create(payload: unknown): Promise<{ ref: string }> {
    if (API_MODE === 'mock') {
      await delay();
      return { ref: 'PF-۱۴۰۵۰۴۰۵-۰۰۲۱' };
    }
    return http.post('/api/leads', payload);
  },
};
