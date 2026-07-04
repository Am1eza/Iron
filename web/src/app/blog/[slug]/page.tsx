import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildMetadata, articleJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { articlesByType } from '@/lib/mock/catalogData';
import { getArticle, getArticlesByType } from '@/lib/server/catalog';
import { formatJalali } from '@/lib/utils/format';
import { Container, Section, Stack, Heading, Breadcrumbs, Badge } from '@/components/ui';
import { SparkIcon, CalendarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ArticleBody } from '@/components/content/ArticleBody';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './article.module.css';

type Params = { params: Promise<{ slug: string }> };

// Matches the /blog list's cadence.
export const revalidate = 600;

export function generateStaticParams() {
  return articlesByType('blog').map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.type !== 'blog') {
    return buildMetadata({ title: 'مطلب یافت نشد', noindex: true, path: routes.blog(slug) });
  }
  return buildMetadata({
    title: article.title,
    description: article.excerpt,
    path: routes.blog(article.slug),
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
        })}
      />

      <Section space={10}>
        <Stack gap={6}>
          <Breadcrumbs items={crumbs} />

          <article className={styles.article}>
            <header className={styles.header}>
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
                {article.source === 'ai' ? (
                  <Badge tone="accent" icon={<SparkIcon size={13} />}>
                    تهیه‌شده با هوش مصنوعی
                  </Badge>
                ) : (
                  <Badge tone="neutral">تحریریهٔ آهن‌تایم</Badge>
                )}
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
