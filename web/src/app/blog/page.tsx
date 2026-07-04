import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getArticlesByType } from '@/lib/server/catalog';
import {
  Container,
  Section,
  Stack,
  Heading,
  Text,
  Overline,
  Breadcrumbs,
  Badge,
  EmptyState,
} from '@/components/ui';
import { SparkIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './blog.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'وبلاگ آهن‌تایم',
  description:
    'راهنمای خرید، تحلیل بازار و آموزش آهن و فولاد. مطالب کاربردی برای پیمانکاران و سازندگان.',
  path: routes.blog(),
});

export default async function BlogPage() {
  const articles = await getArticlesByType('blog');
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
              راهنمای خرید، تحلیل بازار و آموزش آهن‌آلات؛ نوشته‌شده برای کسانی که اول مشورت می‌کنند، بعد
              خرید.
            </Text>
          </div>

          <p className={styles.aiNote}>
            <span className={styles.aiBadge}>
              <Badge tone="accent" icon={<SparkIcon size={13} />}>
                هوش مصنوعی
              </Badge>
            </span>
            بخشی از مطالب با کمک هوش مصنوعی و بر پایهٔ داده‌های روزانهٔ بازار تهیه می‌شود و پیش از انتشار،
            بازبینی کارشناسی دارد.
          </p>

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
