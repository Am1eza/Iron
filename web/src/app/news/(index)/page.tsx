import type { Metadata } from 'next';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';

export const metadata: Metadata = indexMetadata('news', 1);

/** Same no-build-time-content rule as /blog, same EXPORT=1 exception. */
export const revalidate = 600;
export const dynamic = shouldPrerenderMockParams() ? 'auto' : 'force-dynamic';

export default async function NewsPage() {
  return <ArticleIndex type="news" page={1} />;
}
