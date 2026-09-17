import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getArticle, getRelatedArticles } from '@/lib/server/catalog';
import { decodeArticleSlugParam } from '@/lib/utils/articleSlug';
import { ArticleBody, articleDoc } from '@/components/content/ArticleBody';
import { TableOfContents } from '@/components/content/TableOfContents';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { ArticleComments } from '@/components/content/ArticleComments';
import { ArticleDetailContent } from '@/components/content/ArticleDetailContent';

type Params = { params: Promise<{ slug: string; locale: string }> };

// Matches the /news list's cadence.
export const revalidate = 600;

// No `generateStaticParams` here (deliberately, not an oversight): under the
// `[locale]` segment, an empty return combined with the parent's non-empty
// locale params makes Next's on-demand ISR fallback throw
// `DYNAMIC_SERVER_USAGE` for every request — this route 500'd in production
// live (2026-09-14) until this was removed. Omitting the export entirely
// keeps the route plain server-rendered per request instead; `revalidate`
// above no longer applies HTML caching, only request-level dedup.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  // See decodeArticleSlugParam's own comment — params for a non-ASCII
  // slug arrive still percent-encoded in this Next version.
  const slug = decodeArticleSlugParam(rawSlug);
  const article = await getArticle(slug);
  if (!article || article.type !== 'news') {
    // The visible 404 UI itself lives in NotFoundEmptyState.tsx (already
    // localized); this is just the <title> for the same case.
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('newsArticle'), noindex: true, path: routes.news(slug) });
  }
  // Admin-authored SEO overrides (title/description/canonical/ogImage) win when set.
  const seo = article.seo;
  return buildMetadata({
    locale,
    translatedContent: false,
    title: seo?.title ?? article.title,
    description: seo?.description ?? article.excerpt,
    path: seo?.canonical ?? routes.news(article.slug),
    ogImage: seo?.ogImage ?? article.coverUrl,
    // Telegram/WhatsApp/LinkedIn read OG, not JSON-LD (which was already
    // correct here) — every article shared into a steel-trading group
    // rendered as a generic, dateless website card.
    openGraphType: 'article',
    publishedTime: article.publishAt,
    modifiedTime: article.updatedAt,
  });
}

export default async function NewsArticlePage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const { slug: rawSlug } = await params;
  const slug = decodeArticleSlugParam(rawSlug);
  // Independent reads — the related list only needs the static 'news' type,
  // not the resolved article — so fetch both concurrently. The related query
  // is now a single projected `LIMIT 3` (see `relatedArticles`): this used to
  // run TWO queries and hydrate twenty full rows, bodies included, plus a
  // `count(*)` it discarded, to render three title-only cards.
  const [article, related] = await Promise.all([getArticle(slug), getRelatedArticles('news', slug)]);
  if (!article || article.type !== 'news') notFound();

  return (
    <ArticleDetailContent
      type="news"
      article={article}
      related={related}
      tocSlot={<TableOfContents doc={articleDoc(article)} />}
      bodySlot={<ArticleBody article={article} />}
      faqSlot={<ArticleFaq items={article.faq ?? []} />}
      commentsSlot={<ArticleComments articleId={article.id} slug={article.slug} />}
    />
  );
}
