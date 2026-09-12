'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { articleJsonLd } from '@/lib/seo';
import type { Article } from '@/lib/types/domain';
import { formatJalali } from '@/lib/utils/jalali';
import { getLocalizedArticleTitle } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { Container, Section, Stack, Heading, Breadcrumbs, Badge } from '@/components/ui';
import { CalendarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ReadingProgress } from './ReadingProgress';
import { ArticleCard } from './ArticleCard';
import styles from '@/app/[locale]/blog/[slug]/article.module.css';

/**
 * The translated half of the blog/news article detail page — shared by
 * `blog/[slug]/page.tsx` and `news/[slug]/page.tsx` (near-identical apart
 * from a handful of type-scoped strings, same as `ArticleIndexChrome`'s
 * blog/news split). The Server Component page keeps `metadata`/the actual
 * DB read/JSON-LD, and renders `ArticleBody`/`TableOfContents` itself —
 * both stay Server Components on purpose (no Tiptap/ProseMirror or MDX
 * runtime in the reader's bundle) — passing the already-rendered elements
 * in as `bodySlot`/`tocSlot` rather than this component importing them
 * directly, which would force them into the client bundle. `ArticleFaq`/
 * `ArticleComments` are already Client Components from an earlier commit,
 * so they're passed the same way for one consistent shape.
 *
 * `article.title` localizes via `getLocalizedArticleTitle` (title/excerpt
 * only — see `translations` column's doc comment in
 * `lib/server/db/schema/content.ts` for why the article BODY stays
 * fa-only, a deliberate architecture tradeoff, not an oversight).
 */
export function ArticleDetailContent({
  type,
  article,
  related,
  tocSlot,
  bodySlot,
  faqSlot,
  commentsSlot,
}: {
  type: 'blog' | 'news';
  article: Article;
  related: Article[];
  tocSlot: ReactNode;
  bodySlot: ReactNode;
  faqSlot: ReactNode;
  commentsSlot: ReactNode;
}) {
  const t = useTranslations('articleDetail');
  const tNav = useTranslations('nav');
  const locale = useLocale() as AppLocale;
  const title = getLocalizedArticleTitle(article, locale);
  const indexHref = type === 'blog' ? routes.blog() : routes.news();
  const crumbLabel = type === 'blog' ? t('crumbBlog') : t('crumbNews');
  const kicker = type === 'blog' ? t('kickerBlog') : t('kickerNews');
  const backLabel = type === 'blog' ? t('backToBlog') : t('backToNews');
  const relatedLabel = type === 'blog' ? t('relatedBlog') : t('relatedNews');

  const crumbs = [
    { label: tNav('home'), href: routes.home() },
    { label: crumbLabel, href: indexHref },
    { label: title, href: type === 'blog' ? routes.blog(article.slug) : routes.news(article.slug) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={articleJsonLd({
          title,
          url: type === 'blog' ? routes.blog(article.slug) : routes.news(article.slug),
          publishedAt: article.publishAt,
          updatedAt: article.updatedAt,
          image: article.seo?.ogImage ?? article.coverUrl,
          type: type === 'news' ? 'NewsArticle' : undefined,
        })}
      />
      <ReadingProgress />

      <Section space={10}>
        <Stack gap={6}>
          <Breadcrumbs items={crumbs} />

          <article className={styles.article}>
            <header className={styles.header}>
              {article.coverUrl ? (
                <Image
                  src={article.coverUrl}
                  alt={title}
                  width={1200}
                  height={630}
                  priority
                  className={styles.cover}
                />
              ) : null}
              <p className={styles.kicker}>{kicker}</p>
              <Heading level={1}>{title}</Heading>
              <div className={styles.meta}>
                {article.publishAt ? (
                  <span className={styles.date}>
                    <CalendarIcon size={14} aria-hidden="true" />
                    <time className="tnum" dateTime={article.publishAt}>
                      {formatJalali(article.publishAt)}
                    </time>
                  </span>
                ) : null}
                <Badge tone="neutral">{t('byline')}</Badge>
              </div>
            </header>

            {tocSlot}

            <div className={styles.body}>{bodySlot}</div>

            {faqSlot}

            {commentsSlot}

            <Link href={indexHref} className={styles.back}>
              <ChevronStartIcon size={16} className="icon--rtl" />
              {backLabel}
            </Link>
          </article>

          {related.length > 0 ? (
            <section className={styles.related} aria-labelledby="related-title">
              <h2 id="related-title" className={styles.relatedTitle}>
                {relatedLabel}
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
