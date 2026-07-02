/** Sweep expired proformas (validUntil passed) every 10 minutes. */
import { expireDueProformas } from '@/lib/server/repos/leadsRepo';
import type { Job } from './scheduler';

export const proformaExpireJob: Job = {
  name: 'proforma-expire',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await expireDueProformas();
  },
};
