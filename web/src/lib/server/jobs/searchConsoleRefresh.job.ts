/**
 * Refresh the cached Search Console metrics once a day (US-14.4).
 *
 * Daily, not hourly: Search Console's own data only settles after ~2–3 days
 * (see `reportingWindow`), so a more frequent poll would re-fetch identical
 * numbers and spend quota to do it.
 *
 * Safe to interrupt and re-run, like every other job here — each path's cache
 * is replaced wholesale in its own transaction, so a container restart
 * mid-run leaves some paths fresh and some stale, never a half-written page.
 * With `GSC_*` unset (the shipped state) the service returns immediately and
 * this costs one function call a day.
 */
import { refreshAllPublishedArticles } from '@/lib/server/services/searchConsole.service';
import type { Job } from './scheduler';

export const searchConsoleRefreshJob: Job = {
  name: 'search-console-refresh',
  everyMs: 24 * 60 * 60 * 1000,
  // A minute in, not with the usual few-second jitter: on a cold start the
  // useful work is serving requests, not filling an SEO cache nobody is
  // looking at yet.
  initialDelayMs: 60_000,
  run: async () => {
    await refreshAllPublishedArticles();
  },
};
