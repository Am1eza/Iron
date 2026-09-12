import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';
import { parsePageParam } from '@/lib/content/archivePaging';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ n: string }> };

/** `/news/page/N` — see the note in blog/page/[n]/page.tsx. */
export const revalidate = 600;

/**
 * Empty on purpose, but NOT optional: without a `generateStaticParams` export
 * Next classifies this route as fully dynamic (`f` in the build output) and
 * never caches it, which is the exact defect being fixed here. With one — even
 * returning nothing — the route is SSG with `dynamicParams`, so each page is
 * rendered on first request and then ISR-cached for `revalidate`. Verified in
 * the build manifest, and it is the same shape `[slug]` already relies on.
 *
 * Nothing is enumerated at build time because the build has no DATABASE_URL,
 * so a page count taken there would be a fixture count.
 */
export function generateStaticParams(): { n: string }[] {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { n } = await params;
  return indexMetadata('news', parsePageParam(n) ?? 1);
}

export default async function NewsArchivePage({ params }: Params) {
  const { n } = await params;
  const page = parsePageParam(n);
  if (page === null) redirect(routes.news());
  return <ArticleIndex type="news" page={page} />;
}
