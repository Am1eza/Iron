import Link from 'next/link';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import type { NewsTopicRailItem } from '@/lib/server/catalog';
import styles from './NewsTopicRail.module.css';

/**
 * Topic-chip rail for /news (اخبار بازار) — the news-only mirror of
 * `CategoryRail`, deliberately plain pills rather than photo tiles: a market
 * topic (نرخ‌ها, تولید, صادرات, …) is an editorial lens, not a product, and
 * has no photo to ever be missing — see `lib/data/newsTopics.ts`.
 *
 * Same "never show a dead end" rule as `CategoryRail`: only topics with at
 * least one published article are ever passed in (`getNewsTopicRailItems`).
 */
export function NewsTopicRail({ items, activeSlug }: { items: NewsTopicRailItem[]; activeSlug?: string }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className={styles.label}>اخبار را بر اساس موضوع ببینید</p>
      <ul className={styles.rail} aria-label="موضوعات اخبار بازار">
        {items.map((t) => {
          const active = t.slug === activeSlug;
          return (
            <li key={t.slug} className={styles.item}>
              <Link
                href={routes.newsTopic(t.slug)}
                className={styles.chip}
                data-active={active ? '' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.name}>{t.name}</span>
                <span className={`${styles.count} tnum`}>{toPersianDigits(t.count)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
