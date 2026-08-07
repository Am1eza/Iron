import Link from 'next/link';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
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
  if (items.length === 0) return null;

  return (
    <div>
      <p className={styles.label}>مقالات را بر اساس محصول ببینید</p>
      <ul className={styles.rail} aria-label="دسته‌بندی مقالات">
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
                  <span className={styles.name}>{c.name}</span>
                  <span className={`${styles.count} tnum`}>{toPersianDigits(c.count)} مقاله</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
