import type { Metadata } from 'next';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';

export const metadata: Metadata = indexMetadata('blog', 1);

/** Page one is request-rendered because CI has no content DB. This prevents
 * an empty or fixture index from being baked into every production image.
 * Numbered archive pages keep their own path-based rendering strategy. */
export const revalidate = 600;
export const dynamic = 'force-dynamic';

export default async function BlogPage() {
  return <ArticleIndex type="blog" page={1} />;
}
