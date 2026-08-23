/** Poll tgju (usd/eur/gold18/ounce) every TICKER_REFRESH (60s) — see
 *  market.service. Billet has its own slower job: billetPoll.job.ts. */
import { CONSTANTS } from '@/lib/config/constants';
import { refreshMarket } from '@/lib/server/services/market.service';
import type { Job } from './scheduler';

export const marketPollJob: Job = {
  name: 'market-poll',
  everyMs: CONSTANTS.TICKER_REFRESH_SECONDS * 1000,
  run: async () => {
    await refreshMarket();
  },
};
