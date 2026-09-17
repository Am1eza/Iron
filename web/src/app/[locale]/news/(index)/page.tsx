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
  return indexMetadata('news', 1, locale);
}

/** Same no-build-time-content rule as /blog. */
export const revalidate = 600;
export const dynamic = 'force-dynamic';

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ArticleIndex type="news" page={1} />;
}
