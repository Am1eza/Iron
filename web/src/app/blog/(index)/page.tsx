import type { Metadata } from 'next';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';

export const metadata: Metadata = indexMetadata('blog', 1);

/**
 * This route is now GENUINELY incrementally-regenerated, which it was not
 * before: it declared `revalidate = 600` and then `await`ed `searchParams` to
 * read `?page=`, and reading `searchParams` in a Server Component opts the
 * whole route into dynamic rendering in Next 15 — making the export inert.
 * Live, the page answered `Cache-Control: private, no-cache, no-store` and was
 * absent from `.next/prerender-manifest.json`; every visit re-rendered and
 * issued two queries against `articles`. Measured at concurrency 20, that was
 * 45.6 rps / p95 405 ms against 143.7 rps / p95 83 ms for the ISR'd article
 * page — a 3.1x throughput gap on the same box for content that changes a few
 * times a week, and no fallback at all if Postgres blinks.
 *
 * The page number therefore lives in the path (`/blog/page/2`), not in a
 * query string. See `routes.blogPage` and `components/content/ArticleIndex`.
 * Legacy `?page=N` links are 308'd to the path form by middleware.
 */
export const revalidate = 600;

export default async function BlogPage() {
  return <ArticleIndex type="blog" page={1} />;
}
