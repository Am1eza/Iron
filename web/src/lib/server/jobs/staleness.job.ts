/** Flag prices not updated within the current Jalali day (every 10 min). */
import { recomputeStaleness } from '@/lib/server/services/pricing.service';
import type { Job } from './scheduler';

export const stalenessJob: Job = {
  name: 'price-staleness',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await recomputeStaleness();
  },
};
