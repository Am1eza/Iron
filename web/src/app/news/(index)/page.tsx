import type { Metadata } from 'next';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';

export const metadata: Metadata = indexMetadata('news', 1);

/** Same no-build-time-content rule as /blog. */
export const revalidate = 600;
export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  return <ArticleIndex type="news" page={1} />;
}
