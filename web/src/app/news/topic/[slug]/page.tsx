import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { findNewsTopic } from '@/lib/data/newsTopics';
import { getArticlesPageByNewsTopic, getNewsTopicRailItems } from '@/lib/server/catalog';
import { Container, Section, Stack, Heading, Text, Breadcrumbs, EmptyState } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ArticleCard } from '@/components/content/ArticleCard';
import { NewsTopicRail } from '@/components/content/NewsTopicRail';
import styles from './page.module.css';

type Params = { params: Promise<{ slug: string }> };

const PER_PAGE = 24;

// Same cadence as /news itself — a topic page is just a filtered slice of
// the same content, not a differently-changing one.
export const revalidate = 600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const topic = findNewsTopic(slug);
  if (!topic) return buildMetadata({ title: 'موضوع پیدا نشد', noindex: true });
  return buildMetadata({
    title: `اخبار ${topic.name}`,
    description: topic.description,
    path: routes.newsTopic(slug),
  });
}

export default async function NewsTopicPage({ params }: Params) {
  const { slug } = await params;
  const topic = findNewsTopic(slug);
  if (!topic) notFound();

  const [{ articles }, railItems] = await Promise.all([
    getArticlesPageByNewsTopic(topic.slug, 1, PER_PAGE),
    getNewsTopicRailItems(),
  ]);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'اخبار بازار', href: routes.news() },
    { label: topic.name, href: routes.newsTopic(topic.slug) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <Breadcrumbs items={crumbs} />

          {/* Topics have no photo (they're an editorial lens, not a
              product — see lib/data/newsTopics.ts), so this hero is
              always the fallback panel treatment blog/category/[slug]
              uses for an unphotographed category, never the image
              variant. */}
          <div className={styles.hero}>
            <div className={styles.heroContent}>
              <span className={styles.heroKicker}>موضوع خبر</span>
              <Heading level={1} color="inverse">{`اخبار ${topic.name}`}</Heading>
              <Text color="inverse" variant="body">
                {topic.description}
              </Text>
            </div>
          </div>

          <NewsTopicRail items={railItems} activeSlug={topic.slug} />

          {articles.length > 0 ? (
            <ul className={styles.grid} aria-label={`اخبار ${topic.name}`}>
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
          ) : (
            <EmptyState
              size="section"
              headline="هنوز خبری در این موضوع نیست"
              body="به‌محض انتشار، تازه‌ترین اخبار این موضوع اینجا قرار می‌گیرند."
            />
          )}

          <Text color="muted" variant="caption">
            دنبال موضوع دیگری هستید؟ به <Link href={routes.news()}>همهٔ اخبار بازار</Link> سر بزنید.
          </Text>
        </Stack>
      </Section>
    </Container>
  );
}
