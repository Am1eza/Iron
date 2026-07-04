import Link from 'next/link';
import type { Article } from '@/lib/types/domain';
import { routes } from '@/lib/routes';
import { formatJalali } from '@/lib/utils/format';
import { Badge } from '@/components/ui';
import { SparkIcon, CalendarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './ArticleCard.module.css';

/**
 * Content card for the وبلاگ / اخبار lists. Renders title, excerpt, the Jalali
 * publish date, and — when the article is AI-assisted — a calm cobalt
 * «هوش مصنوعی» badge. The whole card is a link to the article page.
 */
export function ArticleCard({ article }: { article: Article }) {
  const href = article.type === 'news' ? routes.news(article.slug) : routes.blog(article.slug);
  const kicker = article.type === 'news' ? 'خبر بازار' : 'مقاله';

  return (
    <li className={styles.item}>
      <Link href={href} className={styles.card}>
        {article.coverUrl ? (
          <img
            src={article.coverUrl}
            alt=""
            width={400}
            height={225}
            loading="lazy"
            decoding="async"
            className={styles.cover}
          />
        ) : null}
        <div className={styles.top}>
          <span className={styles.kicker}>{kicker}</span>
          {article.source === 'ai' ? (
            <Badge tone="accent" icon={<SparkIcon size={13} />}>
              هوش مصنوعی
            </Badge>
          ) : null}
        </div>

        <h3 className={styles.title}>{article.title}</h3>

        {article.excerpt ? <p className={styles.excerpt}>{article.excerpt}</p> : null}

        <div className={styles.foot}>
          {article.publishAt ? (
            <span className={styles.date}>
              <CalendarIcon size={14} aria-hidden="true" />
              <time className="tnum" dateTime={article.publishAt}>
                {formatJalali(article.publishAt)}
              </time>
            </span>
          ) : (
            <span />
          )}
          <span className={styles.more} aria-hidden="true">
            ادامه مطلب
            <ChevronStartIcon size={14} className="icon--rtl" />
          </span>
        </div>
      </Link>
    </li>
  );
}
