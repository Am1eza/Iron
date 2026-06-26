import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const title = decodeURIComponent(slug).replace(/-/g, ' ');
  return buildMetadata({ title, path: routes.blog(slug) });
}

export default async function BlogArticlePage({ params }: Params) {
  const { slug } = await params;
  return <PagePlaceholder eyebrow="وبلاگ" title={decodeURIComponent(slug).replace(/-/g, ' ')} note="صفحهٔ مقاله (SSR + Article schema + لینک محصولات مرتبط) در بخش محتوا ساخته می‌شود." />;
}
