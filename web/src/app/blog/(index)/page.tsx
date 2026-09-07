import type { Metadata } from 'next';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';

export const metadata: Metadata = indexMetadata('blog', 1);

/** Page one is request-rendered because CI has no content DB. This prevents
 * an empty or fixture index from being baked into every production image.
 * Numbered archive pages keep their own path-based rendering strategy.
 *
 * Exception: the EXPORT=1 GitHub Pages preview, the one build where the
 * fixtures ARE the intended content (see prerenderParams.ts) — `output:
 * export` has no runtime to force-dynamic render against anyway. */
export const revalidate = 600;
export const dynamic = shouldPrerenderMockParams() ? 'auto' : 'force-dynamic';

export default async function BlogPage() {
  return <ArticleIndex type="blog" page={1} />;
}
