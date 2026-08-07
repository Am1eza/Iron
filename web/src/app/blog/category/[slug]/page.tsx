import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getArticlesPageByCategory, getBlogCategoryRailItems } from '@/lib/server/catalog';
import { Container, Section, Stack, Heading, Text, Breadcrumbs, EmptyState } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import { CategoryRail } from '@/components/content/CategoryRail';
import styles from './page.module.css';

type Params = { params: Promise<{ slug: string }> };

const PER_PAGE = 24;

// Same cadence as /blog itself — a category page is just a filtered slice of
// the same content, not a differently-changing one.
export const revalidate = 600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const cat = (await getCategories()).find((c) => c.slug === slug);
  if (!cat) return buildMetadata({ title: 'دسته پیدا نشد', noindex: true });
  return buildMetadata({
    title: `مقالات ${cat.name}`,
    description: `راهنمای خرید، تحلیل بازار و اخبار ${cat.name} — مطالب آهن‌تایم دربارهٔ این محصول.`,
    path: routes.blogCategory(slug),
  });
}

export default async function BlogCategoryPage({ params }: Params) {
  const { slug } = await params;
  const cat = (await getCategories()).find((c) => c.slug === slug);
  if (!cat) notFound();

  const [{ articles }, railItems] = await Promise.all([
    getArticlesPageByCategory(cat.id, 1, PER_PAGE),
    getBlogCategoryRailItems(),
  ]);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'وبلاگ', href: routes.blog() },
    { label: cat.name },
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
              <span className={styles.heroKicker}>دستهٔ محصول</span>
              <Heading level={1}>{`مقالات ${cat.name}`}</Heading>
            </div>
          </div>

          <CategoryRail items={railItems} activeSlug={cat.slug} />

          {articles.length > 0 ? (
            <ul className={styles.grid} aria-label={`مقالات دستهٔ ${cat.name}`}>
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
          ) : (
            <EmptyState
              size="section"
              headline="هنوز مقاله‌ای در این دسته نیست"
              body="به‌زودی مطالب مربوط به این محصول اینجا منتشر می‌شوند."
            />
          )}

          <Text color="muted" variant="caption">
            دنبال محصول دیگری هستید؟ به <Link href={routes.blog()}>همهٔ مقالات</Link> سر بزنید.
          </Text>
        </Stack>
      </Section>
    </Container>
  );
}
