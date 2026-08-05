import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArticleIndex, indexMetadata } from '@/components/content/ArticleIndex';
import { parsePageParam } from '@/lib/content/archivePaging';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ n: string }> };

/**
 * `/blog/page/N` — archive page N as a real, cacheable route.
 *
 * A static `page` segment beats the sibling `[slug]` in Next's router, so this
 * never shadows an article. `dynamicParams` is left on (the default): pages
 * are rendered on demand and then ISR-cached, which avoids the
 * `NoFallbackError` GlitchTip flood that `dynamicParams = false` produces for
 * every miss (the same trap documented in lib/server/seo/knownPaths.ts).
 */
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
  return indexMetadata('blog', parsePageParam(n) ?? 1);
}

export default async function BlogArchivePage({ params }: Params) {
  const { n } = await params;
  const page = parsePageParam(n);
  // Junk, `1`, or an absurd number never reaches the database and never mints
  // a cacheable 200 — it is a redirect back to the canonical page-1 URL.
  if (page === null) redirect(routes.blog());
  return <ArticleIndex type="blog" page={page} />;
}
