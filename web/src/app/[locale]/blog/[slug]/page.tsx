import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getArticle, getRelatedArticles } from '@/lib/server/catalog';
import { decodeArticleSlugParam } from '@/lib/utils/articleSlug';
import { ArticleBody, articleDoc } from '@/components/content/ArticleBody';
import { TableOfContents } from '@/components/content/TableOfContents';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { ArticleComments } from '@/components/content/ArticleComments';
import { ArticleDetailContent } from '@/components/content/ArticleDetailContent';

type Params = { params: Promise<{ slug: string }> };

// Matches the /blog list's cadence.
export const revalidate = 600;

// No `generateStaticParams` here (deliberately, not an oversight): under the
// `[locale]` segment, an empty return combined with the parent's non-empty
// locale params makes Next's on-demand ISR fallback throw
// `DYNAMIC_SERVER_USAGE` for every request — this route 500'd in production
// live (2026-09-14) until this was removed. Omitting the export entirely
// keeps the route plain server-rendered per request instead; `revalidate`
// above no longer applies HTML caching, only request-level dedup.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  // See decodeArticleSlugParam's own comment — params for a non-ASCII
  // slug arrive still percent-encoded in this Next version.
  const slug = decodeArticleSlugParam(rawSlug);
  const article = await getArticle(slug);
  if (!article || article.type !== 'blog') {
    // The visible 404 UI itself lives in NotFoundEmptyState.tsx (already
    // localized); this is just the <title> for the same case.
    const t = await getTranslations('meta.notFound');
    return buildMetadata({ title: t('blogArticle'), noindex: true, path: routes.blog(slug) });
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
