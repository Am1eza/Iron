import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  return indexMetadata('blog', 1);
}

/** Page one is request-rendered because CI has no content DB. This prevents
 * an empty or fixture index from being baked into every production image.
 * Numbered archive pages keep their own path-based rendering strategy. */
export const revalidate = 600;
export const dynamic = 'force-dynamic';

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ArticleIndex type="blog" page={1} />;
}
