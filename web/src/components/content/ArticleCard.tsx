import Link from 'next/link';
import type { Article } from '@/lib/types/domain';
import { routes } from '@/lib/routes';
import { formatJalali } from '@/lib/utils/jalali';
import { CalendarIcon, ClockIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './ArticleCard.module.css';

/**
 * Content card for the وبلاگ / اخبار lists — title, excerpt, Jalali date.
 *
 * The link is on the TITLE, stretched over the whole card by a `::after`
 * overlay, rather than wrapping the card. Wrapping it concatenated kicker +
 * title + excerpt + date into one accessible name with no separators, so a
 * screen-reader user tabbing the grid heard ~35 running-together words per
 * card before reaching the next one:
 *
 *   «مقالهپیش‌بینی قیمت میلگرد در تیرماه ۱۴۰۵بررسی عوامل مؤثر…۱۴۰۵/۰۴/۰۵ادامه مطلب»
 *
 * The name is now the title alone; the rest stays readable as sibling text and
 * the entire card is still clickable for mouse and touch.
 */
export function ArticleCard({ article }: { article: Article }) {
  const href = article.type === 'news' ? routes.news(article.slug) : routes.blog(article.slug);
  const kicker = article.type === 'news' ? 'خبر بازار' : 'مقاله';

  return (
    <li className={styles.item}>
      <article className={styles.card}>
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
        </div>

        <h3 className={styles.title}>
          <Link href={href} className={styles.titleLink}>
            {article.title}
          </Link>
        </h3>

        {article.excerpt ? <p className={styles.excerpt}>{article.excerpt}</p> : null}

        <div className={styles.foot}>
          {article.publishAt || article.readingMinutes ? (
            <span className={styles.meta}>
              {article.publishAt ? (
                <span className={styles.date}>
                  <CalendarIcon size={14} aria-hidden="true" />
                  <time className="tnum" dateTime={article.publishAt}>
                    {formatJalali(article.publishAt)}
                  </time>
                </span>
              ) : null}
              {article.readingMinutes ? (
                <span className={styles.readTime}>
                  <ClockIcon size={14} aria-hidden="true" />
                  <span className="tnum">{article.readingMinutes} دقیقه</span>
                </span>
              ) : null}
            </span>
          ) : (
            <span />
          )}
          <span className={styles.more} aria-hidden="true">
            ادامه مطلب
            <ChevronStartIcon size={14} className="icon--rtl" />
          </span>
        </div>
      </article>
    </li>
  );
}
