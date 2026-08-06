/**
 * `revalidatePath` requires an active Next.js request-rendering context (the
 * "static generation store"); it throws when a route handler is invoked
 * directly outside real Next.js request handling — which is exactly how this
 * app's route-handler tests exercise admin write routes (see
 * lib/server/adminApi.test.ts). Cache invalidation failing is never worth
 * failing the write itself (the price/article WAS saved) — swallow it.
 */
import { revalidatePath as nextRevalidatePath } from 'next/cache';

export function safeRevalidatePath(path: string, type?: 'layout' | 'page'): void {
  try {
    nextRevalidatePath(path, type);
  } catch {
    // No request-rendering context (tests, or a non-Next caller) — the ISR
    // page(s) simply fall back to their `revalidate` window instead.
  }
}

export function articleSectionBase(type: 'blog' | 'news'): string {
  return type === 'news' ? '/news' : '/blog';
}

/**
 * Every cached surface that lists a section's articles.
 *
 * `/blog` and `/news` are now genuinely ISR'd, so publishing an article no
 * longer shows up by accident: before, the index was uncached and therefore
 * always current, which is why nothing ever called this from the scheduled
 * publish job. `${base}/page/[n]` purges every paginated archive page at once
 * — the route pattern, not one URL. The feed carries its own 10-minute window
 * and is included for the same reason.
 */
export function revalidateArticleSection(type: 'blog' | 'news'): void {
  const base = articleSectionBase(type);
  safeRevalidatePath(base, 'layout');
  safeRevalidatePath(`${base}/page/[n]`, 'page');
  safeRevalidatePath(`${base}/rss.xml`);
}

/** The article's own public URL. */
export function revalidateArticleUrl(type: 'blog' | 'news', slug: string): void {
  safeRevalidatePath(`${articleSectionBase(type)}/${slug}`);
}
