/** Publish scheduled articles whose time has come (every 60s) + audit. */
import { publishDueArticles } from '@/lib/server/repos/articlesRepo';
import type { Job } from './scheduler';

export const publishArticlesJob: Job = {
  name: 'publish-articles',
  everyMs: 60 * 1000,
  initialDelayMs: 20_000,
  run: async () => {
    await publishDueArticles();
  },
};
