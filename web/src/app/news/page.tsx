import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getArticlesPage } from '@/lib/server/catalog';
import {
  Container,
  Section,
  Stack,
  Heading,
  Text,
  Overline,
  Breadcrumbs,
  Badge,
  EmptyState, Pagination } from '@/components/ui';
import { SparkIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './news.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'اخبار بازار آهن و فولاد',
  description:
    'تازه‌ترین اخبار بازار آهن و فولاد؛ تولید، عرضه و نرخ شمش به‌روزرسانی‌شده برای خرید آگاهانه.',
  path: routes.news(),
});

// New/edited articles publish infrequently; a 10-minute window keeps the list
// fresh without hitting Postgres on every request.
export const revalidate = 600;

const PER_PAGE = 12;

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // The list used to render page 1 of 20 as if it were the whole archive, so
  // the oldest posts silently vanished once this section passed 20 articles.
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { articles, total } = await getArticlesPage('news', page, PER_PAGE);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const crumbs = [{ label: 'خانه', href: routes.home() }, { label: 'اخبار بازار' }];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <Overline>اخبار بازار</Overline>
            <Heading level={1} id="news-title">
              اخبار بازار آهن و فولاد
            </Heading>
            <Text color="muted">
              تازه‌ترین تحولات تولید، عرضه و نرخ شمش؛ تا پیش از خرید، نبض بازار را در دست داشته
              باشید.
            </Text>
          </div>

          <p className={styles.aiNote}>
            <span className={styles.aiBadge}>
              <Badge tone="accent" icon={<SparkIcon size={13} />}>
                هوش مصنوعی
              </Badge>
            </span>
            گزیدهٔ اخبار به‌صورت روزانه و با کمک هوش مصنوعی از داده‌های بازار تهیه و پیش از انتشار
            بازبینی می‌شود.
          </p>

          {articles.length > 0 ? (
            <div>
              <Heading level={2} id="news-list-title">
                همهٔ مطالب
              </Heading>
              <ul className={styles.grid} aria-labelledby="news-list-title">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </ul>
              <Pagination
                page={page}
                pageCount={pageCount}
                hrefFor={(p) => (p === 1 ? routes.news() : `${routes.news()}?page=${p}`)}
              />
            </div>
          ) : (
            <EmptyState
              size="section"
              headline="هنوز خبری منتشر نشده است"
              body="به‌محض انتشار، تازه‌ترین اخبار بازار اینجا قرار می‌گیرند."
              showAi
            />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
