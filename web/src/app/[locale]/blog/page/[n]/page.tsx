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

// No `generateStaticParams` here. It used to return `[]` deliberately, to
// get ISR-cached SSG-with-dynamicParams instead of plain `ƒ` dynamic — see
// git history on this file for that rationale. But under the `[locale]`
// segment (added after that comment was written), an empty return combined
// with the parent's non-empty locale params makes Next's on-demand ISR
// fallback throw `DYNAMIC_SERVER_USAGE` for every request — this route
// 500'd in production live (2026-09-14) until the export was removed.
// `dynamicParams` stays at its default `true`, so this does NOT reintroduce
// the `NoFallbackError` flood `dynamicParams = false` caused (knownPaths.ts)
// — it only gives up the HTML-level ISR cache; `revalidate` above no longer
// applies without a static shell to attach it to.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { n } = await params;
  return await indexMetadata('blog', parsePageParam(n) ?? 1);
}

export default async function BlogArchivePage({ params }: Params) {
  const { n } = await params;
  const page = parsePageParam(n);
  // Junk, `1`, or an absurd number never reaches the database and never mints
  // a cacheable 200 — it is a redirect back to the canonical page-1 URL.
  if (page === null) redirect(routes.blog());
  return <ArticleIndex type="blog" page={page} />;
}
