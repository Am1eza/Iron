'use client';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { localizeDigits } from '@/lib/utils/format';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import type { CategoryRailItem } from '@/lib/server/catalog';
import styles from './CategoryRail.module.css';

/**
 * Photo-tile category rail (US-14.5) — «مقالات را بر اساس محصول ببینید».
 * Only categories with at least one published article are ever passed in
 * (see `blogCategories()` in the pages that render this): a rail entry a
 * reader could click into and find nothing is worse than not showing it —
 * it grows on its own as more articles get filed under a category, never by
 * hiding an empty state behind a click.
 */
export function CategoryRail({ items, activeSlug }: { items: CategoryRailItem[]; activeSlug?: string }) {
  const t = useTranslations('categoryRail');
  const locale = useLocale() as AppLocale;
  if (items.length === 0) return null;

  return (
    <div>
      <p className={styles.label}>{t('label')}</p>
      <ul className={styles.rail} aria-label={t('ariaLabel')}>
        {items.map((c) => {
          const active = c.slug === activeSlug;
          return (
            <li key={c.slug} className={styles.item}>
              <Link
                href={routes.blogCategory(c.slug)}
                className={`${styles.tile} ${c.imageUrl ? '' : styles.tileFallback}`}
                data-active={active ? '' : undefined}
                aria-current={active ? 'page' : undefined}
                style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})` } : undefined}
              >
                <span className={styles.scrim} aria-hidden="true" />
                <span className={styles.text}>
                  <span className={styles.name}>{getLocalizedName(c, locale)}</span>
                  <span className={`${styles.count} tnum`}>
                    {t('articleCount', { count: localizeDigits(c.count, locale) })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
