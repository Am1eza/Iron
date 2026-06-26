import { API_MODE } from '../config';
import { http } from '../http';

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const toolsApi = {
  async weight(payload: { theoreticalWeightKg: number; qty: number }): Promise<{ totalWeightKg: number }> {
    if (API_MODE === 'mock') {
      await delay();
      return { totalWeightKg: Math.round(payload.theoreticalWeightKg * payload.qty * 100) / 100 };
    }
    return http.post('/api/tools/weight', payload);
  },
};
