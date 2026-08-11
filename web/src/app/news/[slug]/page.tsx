import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildMetadata, articleJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { articlesByType } from '@/lib/mock/catalogData';
import { getArticle, getRelatedArticles } from '@/lib/server/catalog';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { decodeArticleSlugParam } from '@/lib/utils/articleSlug';
import { formatJalali } from '@/lib/utils/jalali';
import { Container, Section, Stack, Heading, Breadcrumbs, Badge } from '@/components/ui';
import { CalendarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ArticleBody } from '@/components/content/ArticleBody';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './article.module.css';

type Params = { params: Promise<{ slug: string }> };

// Matches the /news list's cadence.
export const revalidate = 600;

/** Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return articlesByType('news').map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  // See decodeArticleSlugParam's own comment — params for a non-ASCII
  // slug arrive still percent-encoded in this Next version.
  const slug = decodeArticleSlugParam(rawSlug);
  const article = await getArticle(slug);
  if (!article || article.type !== 'news') {
    return buildMetadata({ title: 'خبر یافت نشد', noindex: true, path: routes.news(slug) });
  }
  // Admin-authored SEO overrides (title/description/canonical/ogImage) win when set.
  const seo = article.seo;
  return buildMetadata({
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
  const { slug: rawSlug } = await params;
  const slug = decodeArticleSlugParam(rawSlug);
  // Independent reads — the related list only needs the static 'news' type,
  // not the resolved article — so fetch both concurrently. The related query
  // is now a single projected `LIMIT 3` (see `relatedArticles`): this used to
  // run TWO queries and hydrate twenty full rows, bodies included, plus a
  // `count(*)` it discarded, to render three title-only cards.
  const [article, related] = await Promise.all([getArticle(slug), getRelatedArticles('news', slug)]);
  if (!article || article.type !== 'news') notFound();

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'اخبار بازار', href: routes.news() },
    { label: article.title },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={articleJsonLd({
          type: 'NewsArticle',
          title: article.title,
          url: routes.news(article.slug),
          publishedAt: article.publishAt,
          updatedAt: article.updatedAt,
          image: article.seo?.ogImage ?? article.coverUrl,
        })}
      />

      <Section space={10}>
        <Stack gap={6}>
          <Breadcrumbs items={crumbs} />

          <article className={styles.article}>
            <header className={styles.header}>
              {article.coverUrl ? (
                <img
                  src={article.coverUrl}
                  alt={article.title}
                  width={1200}
                  height={630}
                  loading="eager"
                  decoding="async"
                  className={styles.cover}
                />
              ) : null}
              <p className={styles.kicker}>خبر بازار</p>
              <Heading level={1}>{article.title}</Heading>
              <div className={styles.meta}>
                {article.publishAt ? (
                  <span className={styles.date}>
                    <CalendarIcon size={14} aria-hidden="true" />
                    <time className="tnum" dateTime={article.publishAt}>
                      {formatJalali(article.publishAt)}
                    </time>
                  </span>
                ) : null}
                <Badge tone="neutral">تحریریهٔ آهن‌تایم</Badge>
              </div>
            </header>

            <div className={styles.body}>
              <ArticleBody article={article} />
            </div>

            <ArticleFaq items={article.faq ?? []} />

            <Link href={routes.news()} className={styles.back}>
              <ChevronStartIcon size={16} className="icon--rtl" />
              بازگشت به اخبار
            </Link>
          </article>

          {related.length > 0 ? (
            <section className={styles.related} aria-labelledby="related-title">
              <h2 id="related-title" className={styles.relatedTitle}>
                اخبار مرتبط
              </h2>
              <ul className={styles.relatedGrid}>
                {related.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </ul>
            </section>
          ) : null}
        </Stack>
      </Section>
    </Container>
  );
}
