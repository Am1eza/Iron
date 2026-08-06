import type { Metadata } from 'next';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';

export const metadata: Metadata = indexMetadata('news', 1);

/** Same rendering-strategy fix as /blog — see the note in blog/page.tsx. */
export const revalidate = 600;

export default async function NewsPage() {
  return <ArticleIndex type="news" page={1} />;
}
