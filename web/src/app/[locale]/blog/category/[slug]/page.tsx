import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  getCategories,
  getArticlesPageByCategory,
  getBlogCategoryRailItems,
} from '@/lib/server/catalog';
import { Container, Section, Stack, Heading, Text, Breadcrumbs, EmptyState } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import { CategoryRail } from '@/components/content/CategoryRail';
import styles from './page.module.css';

type Params = { params: Promise<{ slug: string; locale: string }> };

const PER_PAGE = 24;

// Same cadence as /blog itself — a category page is just a filtered slice of
// the same content, not a differently-changing one.
export const revalidate = 600;

// No `generateStaticParams` here (deliberately, not an oversight): under the
// `[locale]` segment, an empty return combined with the parent's non-empty
// locale params makes Next's on-demand ISR fallback throw
// `DYNAMIC_SERVER_USAGE` for every request — this route 500'd in production
// live (2026-09-14) until this was removed. Omitting the export entirely
// keeps the route plain server-rendered per request instead; `revalidate`
// above no longer applies HTML caching, only request-level dedup.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, locale } = await params;
  const cat = (await getCategories()).find((c) => c.slug === slug);
  const tMeta = await getTranslations({ locale, namespace: 'blogCategory' });
  if (!cat) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('blogCategory'), noindex: true });
  }
  return buildMetadata({
    locale,
    title: tMeta('heading', { category: cat.name }),
    description: tMeta('metaDescription', { category: cat.name }),
    path: routes.blogCategory(slug),
  });
}

export default async function BlogCategoryPage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const tNav = await getTranslations({ locale: pageLocale });
  const t = await getTranslations({ locale: pageLocale, namespace: 'blogCategory' });
  const { slug } = await params;
  const cat = (await getCategories()).find((c) => c.slug === slug);
  if (!cat) notFound();

  const [{ articles }, railItems] = await Promise.all([
    getArticlesPageByCategory(cat.id, 1, PER_PAGE),
    getBlogCategoryRailItems(),
  ]);

  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('articleDetail.crumbBlog'), href: routes.blog() },
    { label: cat.name, href: routes.blogCategory(cat.slug) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <Breadcrumbs items={crumbs} />

          <div
            className={`${styles.hero} ${cat.imageUrl ? '' : styles.heroFallback}`}
            style={cat.imageUrl ? { backgroundImage: `url(${cat.imageUrl})` } : undefined}
          >
            <span className={styles.heroScrim} aria-hidden="true" />
            <div className={styles.heroContent}>
              <span className={styles.heroKicker}>{t('kicker')}</span>
              <Heading level={1} color="inverse">
                {t('heading', { category: cat.name })}
              </Heading>
            </div>
          </div>

          <CategoryRail items={railItems} activeSlug={cat.slug} />

          {articles.length > 0 ? (
            <ul className={styles.grid} aria-label={t('listLabel', { category: cat.name })}>
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
          ) : (
            <EmptyState size="section" headline={t('emptyHeadline')} body={t('emptyBody')} />
          )}

          <Text color="muted" variant="caption">
            {t('footerBefore')} <Link href={routes.blog()}>{t('footerLink')}</Link>{' '}
            {t('footerAfter')}
          </Text>
        </Stack>
      </Section>
    </Container>
  );
}
