'use client';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
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
  const t = useTranslations('newsTopicRail');
  const locale = useLocale() as AppLocale;
  if (items.length === 0) return null;

  return (
    <div>
      <p className={styles.label}>{t('label')}</p>
      <ul className={styles.rail} aria-label={t('ariaLabel')}>
        {items.map((topic) => {
          const active = topic.slug === activeSlug;
          return (
            <li key={topic.slug} className={styles.item}>
              <Link
                href={routes.newsTopic(topic.slug)}
                className={styles.chip}
                data-active={active ? '' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.name}>{t(`topic.${topic.slug}`)}</span>
                <span className={`${styles.count} tnum`}>{localizeDigits(topic.count, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
