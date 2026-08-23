/**
 * Poll esfahanahan for شمش فولاد every BILLET_REFRESH (15 min) — see
 * market.service's `refreshBillet()`.
 *
 * Deliberately NOT folded into `marketPollJob`'s 60s tick: that cadence
 * exists for FX and gold, which move minute to minute. Billet is a B2B steel
 * retailer's published price — it changes a handful of times a day, so a 60s
 * poll would be ~1,440 requests a day at an undocumented third-party endpoint
 * to observe maybe three changes. 15 min keeps the ticker within a quarter
 * hour of the source (well inside the 5-minute ISR window of the pages that
 * quote it, and far tighter than the WEEK of staleness this replaces) at
 * ~96 requests/day.
 *
 * Offset from the market poll's start so the two feeds don't tick together on
 * every 15th minute.
 */
import { CONSTANTS } from '@/lib/config/constants';
import { refreshBillet } from '@/lib/server/services/market.service';
import type { Job } from './scheduler';

export const billetPollJob: Job = {
  name: 'billet-poll',
  everyMs: CONSTANTS.BILLET_REFRESH_SECONDS * 1000,
  initialDelayMs: 20_000,
  run: async () => {
    await refreshBillet();
  },
};
