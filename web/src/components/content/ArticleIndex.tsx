import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { PER_PAGE, archiveHref } from '@/lib/content/archivePaging';
import { getArticlesPage, getBlogCategoryRailItems, getNewsTopicRailItems } from '@/lib/server/catalog';
import { Container, Section, Stack, Breadcrumbs, Pagination } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import { CategoryRail } from '@/components/content/CategoryRail';
import { NewsTopicRail } from '@/components/content/NewsTopicRail';
import { ArticleIndexHeader, ArticleIndexHeading, ArticleIndexEmptyState } from '@/components/content/ArticleIndexChrome';
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

// How many of the already-fetched (recency-ordered) blog articles surface as
// the featured strip above the category rail — a preview, not the full
// «همهٔ مطالب» list (see the render-site comment on why that stays hidden).
const FEATURED_COUNT = 4;

const FEED: Record<'blog' | 'news', string> = {
  blog: '/blog/rss.xml',
  news: '/news/rss.xml',
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
export async function indexMetadata(type: 'blog' | 'news', page: number): Promise<Metadata> {
  const [t, tMeta] = await Promise.all([
    getTranslations(type === 'blog' ? 'meta.blogIndex' : 'meta.newsIndex'),
    getTranslations('meta'),
  ]);
  const title = t('title');
  const base = buildMetadata({
    title: page > 1 ? `${title}${tMeta('pageSuffix', { page })}` : title,
    description: t('description'),
    path: archiveHref(type, page),
  });
  if (page > 1) return base;
  return {
    ...base,
    alternates: {
      ...base.alternates,
      types: { 'application/rss+xml': [{ url: FEED[type], title }] },
    },
  };
}

export async function ArticleIndex({ type, page }: { type: 'blog' | 'news'; page: number }) {
  const t = await getTranslations();
  const crumbLabel = type === 'blog' ? t('articleDetail.crumbBlog') : t('articleDetail.crumbNews');
  // Category rail (product-based, میلگرد/ورق/…) stays /blog-only — a
  // category page still surfaces both types together (see
  // `listPublishedByCategory`), but the ARCHIVE rail itself answers "what
  // product is this about", which a flat news feed never asked to be
  // filtered by (the original reasoning here, kept). /news gets its own
  // topic rail instead (اخبار بازار — نرخ‌ها/تولید/صادرات/…, see
  // `lib/data/newsTopics.ts`): a DIFFERENT, news-specific question that a
  // product category can't answer (a تعرفه story isn't "a category").
  const [{ articles, total }, blogRailItems, newsRailItems] = await Promise.all([
    getArticlesPage(type, page, PER_PAGE),
    type === 'blog' ? getBlogCategoryRailItems() : Promise.resolve([]),
    type === 'news' ? getNewsTopicRailItems() : Promise.resolve([]),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  // FALLBACK ONLY — the primary answer for an out-of-range page is a genuine
  // 404 from the middleware guard, which knows the real page count
  // (`publishedGuardPaths` publishes /blog/page/2..N). This branch is
  // reachable only while that guard is failing open: a cold process, or a DB
  // blip that left `known` empty. It cannot itself produce a real status code
  // — `redirect()` inside an already-matched route replies 200 with a
  // client-side hop in this Next version, exactly like `notFound()` does
  // (measured) — so it is a courtesy, not the control.
  //
  // What it replaces either way: page 1's "هنوز مطلبی منتشر نشده است" empty
  // state, rendered at 200 with no pager on screen, telling the visitor the
  // publication does not exist and offering no way back.
  if (page > pageCount) redirect({ href: archiveHref(type, pageCount), locale: await getLocale() });

  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: crumbLabel, href: archiveHref(type, page) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <ArticleIndexHeader type={type} />
          </div>

          {/* A preview, not the flat list — see the comment below on why
              «همهٔ مطالب» itself stays hidden for blog. This is 4 cards at
              most (blog is at 4 articles total today, so it's currently
              everything), sits ABOVE the rail rather than in the space
              reserved below it, and exists to fix a distinct problem: page 1
              rendering with literally zero article content until a reader
              picks a category first. */}
          {type === 'blog' && page === 1 && articles.length > 0 ? (
            <div>
              <ArticleIndexHeading type={type} variant="featured" id="blog-featured-title" />
              <ul className={styles.grid} aria-labelledby="blog-featured-title">
                {articles.slice(0, FEATURED_COUNT).map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </ul>
            </div>
          ) : null}

          {type === 'blog' ? <CategoryRail items={blogRailItems} /> : <NewsTopicRail items={newsRailItems} />}

          {/* «همهٔ مطالب» — the flat, undifferentiated list — is deliberately
              blog-only content, dropped per Amir/Kamyar's explicit request
              (2026-08-08): with the category rail above, a flat firehose
              right under it read as redundant, and that space is earmarked
              for a videos/podcast section later. /news keeps it — a single
              reverse-chronological feed is the whole point of a news page,
              and it has no category rail of its own to make it feel
              duplicated.
              Deliberately NOT ripped out at the route/pagination level
              (`/blog/page/[n]`, the 404 guard, the sitemap entries) — blog
              is at 4 articles today, nowhere near PER_PAGE (12), so no
              `/blog/page/2` exists yet for this to matter. If blog article
              count ever crosses that threshold, revisit whether a paged
              archive still makes sense in a category-first model rather
              than silently re-enabling a hidden list nobody asked to see
              again. */}
          {type === 'news' &&
            (articles.length > 0 ? (
              <div>
                <ArticleIndexHeading type={type} variant="list" id={`${type}-list-title`} />
                <ul className={styles.grid} aria-labelledby={`${type}-list-title`}>
                  {articles.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </ul>
                <Pagination page={page} pageCount={pageCount} hrefFor={(p) => archiveHref(type, p)} />
              </div>
            ) : (
              <ArticleIndexEmptyState type={type} />
            ))}

          {type === 'blog' && articles.length === 0 ? <ArticleIndexEmptyState type={type} /> : null}
        </Stack>
      </Section>
    </Container>
  );
}
