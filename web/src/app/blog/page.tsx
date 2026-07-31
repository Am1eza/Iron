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
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './blog.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'وبلاگ آهن‌تایم',
  description:
    'راهنمای خرید، تحلیل بازار و آموزش آهن و فولاد. مطالب کاربردی برای پیمانکاران و سازندگان.',
  path: routes.blog(),
});

// New/edited articles publish infrequently; a 10-minute window keeps the list
// fresh without hitting Postgres on every request.
export const revalidate = 600;

const PER_PAGE = 12;

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // The list used to render page 1 of 20 as if it were the whole archive, so
  // the oldest posts silently vanished once this section passed 20 articles.
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { articles, total } = await getArticlesPage('blog', page, PER_PAGE);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const crumbs = [{ label: 'خانه', href: routes.home() }, { label: 'وبلاگ' }];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <Overline>محتوای آموزشی</Overline>
            <Heading level={1} id="blog-title">
              وبلاگ آهن‌تایم
            </Heading>
            <Text color="muted">
              راهنمای خرید، تحلیل بازار و آموزش آهن‌آلات؛ نوشته‌شده برای کسانی که اول مشورت می‌کنند،
              بعد خرید.
            </Text>
          </div>

          {articles.length > 0 ? (
            <div>
              <Heading level={2} id="blog-list-title">
                همهٔ مطالب
              </Heading>
              <ul className={styles.grid} aria-labelledby="blog-list-title">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </ul>
              <Pagination
                page={page}
                pageCount={pageCount}
                hrefFor={(p) => (p === 1 ? routes.blog() : `${routes.blog()}?page=${p}`)}
              />
            </div>
          ) : (
            <EmptyState
              size="section"
              headline="هنوز مطلبی منتشر نشده است"
              body="به‌زودی نخستین مقاله‌های آهن‌تایم اینجا منتشر می‌شوند."
              showAi
            />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
