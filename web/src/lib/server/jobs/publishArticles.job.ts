/** Publish scheduled articles whose time has come (every 60s) + audit. */
import { publishDueArticles } from '@/lib/server/repos/articlesRepo';
import type { Job } from './scheduler';

export const publishArticlesJob: Job = {
  name: 'publish-articles',
  everyMs: 60 * 1000,
  initialDelayMs: 20_000,
  run: async () => {
    const published = await publishDueArticles();
    if (published.length === 0) return;
    // Deliberately NO revalidatePath() here, and this is worth being precise
    // about because it looks like an omission.
    //
    // This scheduler runs as its OWN process (scripts/jobs.ts — see
    // instrumentation.ts), so `revalidatePath` has no rendering context to act
    // on and would silently do nothing; and even inside the web container the
    // ISR cache is per-worker across WEB_CONCURRENCY forks, so one call would
    // purge one worker of five. The honest bound is therefore the routes' own
    // `revalidate = 600`: a SCHEDULED article appears within ten minutes,
    // exactly like the RSS feeds and the sitemap memo already behave. An
    // editor publishing from the panel is unaffected — that path runs inside a
    // request and revalidates synchronously.
    //
    // Making this instant needs a shared (Redis-backed) Next cache handler, so
    // that one purge reaches every worker. That is a deployment change, not a
    // line of code here.
    console.info(
      `[jobs] published ${published.length} scheduled article(s): ` +
        published.map((a) => `/${a.type}/${a.slug}`).join(', '),
    );
  },
};
