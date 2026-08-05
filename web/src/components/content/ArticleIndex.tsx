import { cache } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { PER_PAGE, archiveHref } from '@/lib/content/archivePaging';
import { getArticlesPage } from '@/lib/server/catalog';
import { Container, Section, Stack, Heading, Text, Overline, Breadcrumbs, EmptyState, Pagination } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './ArticleIndex.module.css';

/**
 * The /blog and /news archive, page N.
 *
 * One component for both because `blog/page.tsx` and `news/page.tsx` were
 * byte-identical apart from four strings and the `'blog'|'news'` literal —
 * including a copy-pasted comment about the pagination bug and an unused
 * `Badge` import in each. Every fix had to be applied twice, and the two had
 * already begun to drift.
 */

type Copy = {
  overline: string;
  h1: string;
  lede: string;
  crumb: string;
  listTitle: string;
  emptyHeadline: string;
  emptyBody: string;
};

export const INDEX_COPY: Record<'blog' | 'news', Copy> = {
  blog: {
    overline: 'محتوای آموزشی',
    h1: 'وبلاگ آهن‌تایم',
    lede: 'راهنمای خرید، تحلیل بازار و آموزش آهن‌آلات؛ نوشته‌شده برای کسانی که اول مشورت می‌کنند، بعد خرید.',
    crumb: 'وبلاگ',
    listTitle: 'همهٔ مطالب',
    emptyHeadline: 'هنوز مطلبی منتشر نشده است',
    emptyBody: 'به‌زودی نخستین مقاله‌های آهن‌تایم اینجا منتشر می‌شوند.',
  },
  news: {
    overline: 'اخبار بازار',
    h1: 'اخبار بازار آهن و فولاد',
    lede: 'تازه‌ترین تحولات تولید، عرضه و نرخ شمش؛ تا پیش از خرید، نبض بازار را در دست داشته باشید.',
    crumb: 'اخبار بازار',
    listTitle: 'همهٔ مطالب',
    emptyHeadline: 'هنوز خبری منتشر نشده است',
    emptyBody: 'به‌محض انتشار، تازه‌ترین اخبار بازار اینجا قرار می‌گیرند.',
  },
};

/** Deduped so `generateMetadata` and the page body share one query per render. */
const loadPage = cache((type: 'blog' | 'news', page: number) => getArticlesPage(type, page, PER_PAGE));

const META: Record<'blog' | 'news', { title: string; description: string; feed: string }> = {
  blog: {
    title: 'وبلاگ آهن‌تایم',
    description:
      'راهنمای خرید، تحلیل بازار و آموزش آهن و فولاد. مطالب کاربردی برای پیمانکاران و سازندگان.',
    feed: '/blog/rss.xml',
  },
  news: {
    title: 'اخبار بازار آهن و فولاد',
    description:
      'تازه‌ترین اخبار بازار آهن و فولاد؛ تولید، عرضه و نرخ شمش به‌روزرسانی‌شده برای خرید آگاهانه.',
    feed: '/news/rss.xml',
  },
};

/**
 * Every archive page self-canonicalises. `?page=2` used to inherit page 1's
 * fixed canonical, which told Google page 2 was a duplicate of page 1 — so
 * articles reachable only from page 2 onwards lost their internal-link signal
 * entirely. Latent at 7 articles; armed for the 13th.
 *
 * The RSS `<link rel="alternate">` stays on page 1 only: a feed is the whole
 * section, not this slice of it. (Section-scoped rather than site-wide for the
 * reason spelled out in the original blog/page.tsx comment — a site-wide
 * alternate would advertise the blog feed on /prices/rebar, which is false.)
 */
export function indexMetadata(type: 'blog' | 'news', page: number): Metadata {
  const m = META[type];
  const base = buildMetadata({
    title: page > 1 ? `${m.title} — صفحهٔ ${page}` : m.title,
    description: m.description,
    path: archiveHref(type, page),
  });
  if (page > 1) return base;
  return {
    ...base,
    alternates: {
      ...base.alternates,
      types: { 'application/rss+xml': [{ url: m.feed, title: m.title }] },
    },
  };
}

export async function ArticleIndex({ type, page }: { type: 'blog' | 'news'; page: number }) {
  const copy = INDEX_COPY[type];
  const { articles, total } = await loadPage(type, page);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  // Out of range used to render page 1's "هنوز مطلبی منتشر نشده است" empty
  // state at HTTP 200 with no pager on screen — telling the visitor the
  // publication does not exist, offering no way back, and handing crawlers an
  // unbounded soft-404 space. Send the reader to real content instead. A
  // redirect is also the only response here that is not a cacheable 200:
  // `notFound()` replies 200 inside an already-matched route in this Next
  // version (see lib/server/seo/knownPaths.ts).
  if (page > pageCount) redirect(archiveHref(type, pageCount));

  const crumbs = [{ label: 'خانه', href: routes.home() }, { label: copy.crumb }];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <Overline>{copy.overline}</Overline>
            <Heading level={1} id={`${type}-title`}>
              {copy.h1}
            </Heading>
            <Text color="muted">{copy.lede}</Text>
          </div>

          {articles.length > 0 ? (
            <div>
              <Heading level={2} id={`${type}-list-title`}>
                {copy.listTitle}
              </Heading>
              <ul className={styles.grid} aria-labelledby={`${type}-list-title`}>
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </ul>
              <Pagination page={page} pageCount={pageCount} hrefFor={(p) => archiveHref(type, p)} />
            </div>
          ) : (
            <EmptyState
              size="section"
              headline={copy.emptyHeadline}
              body={copy.emptyBody}
              showAi
            />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
