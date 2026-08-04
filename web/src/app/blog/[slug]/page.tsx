import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildMetadata, articleJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { articlesByType } from '@/lib/mock/catalogData';
import { getArticle, getArticlesByType } from '@/lib/server/catalog';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { formatJalali } from '@/lib/utils/jalali';
import { Container, Section, Stack, Heading, Breadcrumbs, Badge } from '@/components/ui';
import { CalendarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ArticleBody } from '@/components/content/ArticleBody';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './article.module.css';

type Params = { params: Promise<{ slug: string }> };

// Matches the /blog list's cadence.
export const revalidate = 600;

/** Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return articlesByType('blog').map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.type !== 'blog') {
    return buildMetadata({ title: 'مطلب یافت نشد', noindex: true, path: routes.blog(slug) });
  }
  // Admin-authored SEO overrides (title/description/canonical/ogImage) win when set.
  const seo = article.seo;
  return buildMetadata({
    title: seo?.title ?? article.title,
    description: seo?.description ?? article.excerpt,
    path: seo?.canonical ?? routes.blog(article.slug),
    ogImage: seo?.ogImage ?? article.coverUrl,
  });
}

export default async function BlogArticlePage({ params }: Params) {
  const { slug } = await params;
  // Independent reads — the related list only needs the static 'blog' type,
  // not the resolved article — so fetch both concurrently.
  const [article, allBlog] = await Promise.all([getArticle(slug), getArticlesByType('blog')]);
  if (!article || article.type !== 'blog') notFound();

  const related = allBlog.filter((a) => a.slug !== article.slug).slice(0, 3);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'وبلاگ', href: routes.blog() },
    { label: article.title },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={articleJsonLd({
          title: article.title,
          url: routes.blog(article.slug),
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
              <p className={styles.kicker}>مقاله</p>
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

            <Link href={routes.blog()} className={styles.back}>
              <ChevronStartIcon size={16} className="icon--rtl" />
              بازگشت به وبلاگ
            </Link>
          </article>

          {related.length > 0 ? (
            <section className={styles.related} aria-labelledby="related-title">
              <h2 id="related-title" className={styles.relatedTitle}>
                مطالب مرتبط
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
