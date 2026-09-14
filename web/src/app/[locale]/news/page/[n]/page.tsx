import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';
import { parsePageParam } from '@/lib/content/archivePaging';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ n: string }> };

/** `/news/page/N` — see the note in blog/page/[n]/page.tsx. */
export const revalidate = 600;

// No `generateStaticParams` here — see the note in blog/page/[n]/page.tsx:
// an empty return under the `[locale]` segment threw `DYNAMIC_SERVER_USAGE`
// for every request in production (2026-09-14). `dynamicParams` stays at
// its default `true`.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { n } = await params;
  return await indexMetadata('news', parsePageParam(n) ?? 1);
}

export default async function NewsArchivePage({ params }: Params) {
  const { n } = await params;
  const page = parsePageParam(n);
  if (page === null) redirect(routes.news());
  return <ArticleIndex type="news" page={page} />;
}
