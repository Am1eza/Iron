import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildMetadata, articleJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { articlesByType } from '@/lib/mock/catalogData';
import { getArticle, getArticlesByType } from '@/lib/server/catalog';
import { formatJalali } from '@/lib/utils/format';
import {
  Container,
  Section,
  Stack,
  Heading,
  Breadcrumbs,
  Badge,
} from '@/components/ui';
import { SparkIcon, CalendarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ArticleBody } from '@/components/content/ArticleBody';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './article.module.css';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return articlesByType('news').map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.type !== 'news') {
    return buildMetadata({ title: 'خبر یافت نشد', noindex: true, path: routes.news(slug) });
  }
  return buildMetadata({
    title: article.title,
    description: article.excerpt,
    path: routes.news(article.slug),
  });
}

export default async function NewsArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.type !== 'news') notFound();

  const related = (await getArticlesByType('news'))
    .filter((a) => a.slug !== article.slug)
    .slice(0, 3);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'اخبار بازار', href: routes.news() },
    { label: article.title },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={articleJsonLd({
          title: article.title,
          url: routes.news(article.slug),
          publishedAt: article.publishAt,
        })}
      />

      <Section space={10}>
        <Stack gap={6}>
          <Breadcrumbs items={crumbs} />

          <article className={styles.article}>
            <header className={styles.header}>
              <p className={styles.kicker}>خبر بازار</p>
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

            <Link href={routes.news()} className={styles.back}>
              <ChevronStartIcon size={16} className="icon--rtl" />
              بازگشت به اخبار
            </Link>
          </article>

          {related.length > 0 ? (
            <section className={styles.related} aria-labelledby="related-title">
              <h2 id="related-title" className={styles.relatedTitle}>
                اخبار مرتبط
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
