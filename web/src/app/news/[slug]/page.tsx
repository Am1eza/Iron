import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const title = decodeURIComponent(slug).replace(/-/g, ' ');
  return buildMetadata({ title, path: routes.news(slug) });
}

export default async function NewsArticlePage({ params }: Params) {
  const { slug } = await params;
  return <PagePlaceholder eyebrow="اخبار" title={decodeURIComponent(slug).replace(/-/g, ' ')} note="صفحهٔ خبر (SSR + Article schema) در بخش محتوا ساخته می‌شود." />;
}

export function generateStaticParams() {
  return [{ slug: 'sample-news' }];
}
