import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { articlesByType } from '@/lib/mock/catalogData';
import { getArticle, getRelatedArticles } from '@/lib/server/catalog';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { decodeArticleSlugParam } from '@/lib/utils/articleSlug';
import { ArticleBody, articleDoc } from '@/components/content/ArticleBody';
import { TableOfContents } from '@/components/content/TableOfContents';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { ArticleComments } from '@/components/content/ArticleComments';
import { ArticleDetailContent } from '@/components/content/ArticleDetailContent';

type Params = { params: Promise<{ slug: string }> };

// Matches the /blog list's cadence.
export const revalidate = 600;

/** Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return articlesByType('blog').map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  // See decodeArticleSlugParam's own comment — params for a non-ASCII
  // slug arrive still percent-encoded in this Next version.
  const slug = decodeArticleSlugParam(rawSlug);
  const article = await getArticle(slug);
  if (!article || article.type !== 'blog') {
    // fa — the established SSR-shell exception; the translated 404 UI a
    // visitor actually sees lives in NotFoundEmptyState.tsx.
    return buildMetadata({ title: 'مطلب یافت نشد', noindex: true, path: routes.blog(slug) });
  }
  // Admin-authored SEO overrides (title/description/canonical/ogImage) win when set.
  const seo = article.seo;
  return buildMetadata({
    title: seo?.title ?? article.title,
    description: seo?.description ?? article.excerpt,
    path: seo?.canonical ?? routes.blog(article.slug),
    ogImage: seo?.ogImage ?? article.coverUrl,
    // Telegram/WhatsApp/LinkedIn read OG, not JSON-LD (which was already
    // correct here) — every article shared into a steel-trading group
    // rendered as a generic, dateless website card.
    openGraphType: 'article',
    publishedTime: article.publishAt,
    modifiedTime: article.updatedAt,
  });
}

export default async function BlogArticlePage({ params }: Params) {
  const { slug: rawSlug } = await params;
  const slug = decodeArticleSlugParam(rawSlug);
  // Independent reads — the related list only needs the static 'blog' type,
  // not the resolved article — so fetch both concurrently. The related query
  // is now a single projected `LIMIT 3` (see `relatedArticles`): this used to
  // run TWO queries and hydrate twenty full rows, bodies included, plus a
  // `count(*)` it discarded, to render three title-only cards.
  const [article, related] = await Promise.all([getArticle(slug), getRelatedArticles('blog', slug)]);
  if (!article || article.type !== 'blog') notFound();

  return (
    <ArticleDetailContent
      type="blog"
      article={article}
      related={related}
      tocSlot={<TableOfContents doc={articleDoc(article)} />}
      bodySlot={<ArticleBody article={article} />}
      faqSlot={<ArticleFaq items={article.faq ?? []} />}
      commentsSlot={<ArticleComments articleId={article.id} slug={article.slug} />}
    />
  );
}
