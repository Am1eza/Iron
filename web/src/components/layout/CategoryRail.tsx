'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import type { Category } from '@/lib/types/domain';
import { CategoryGlyph } from '@/components/primitives/icons';
import styles from './CategoryRail.module.css';

/**
 * N4 · Fixed Category Rail — the product's signature navigation.
 * Desktop: fixed to the inline-start edge (right, RTL), vertically centered; each
 * item rests as a NAME and morphs into the category GLYPH on hover/focus (crossfade;
 * instant under reduced-motion via tokenized durations). The current category shows
 * the glyph + a persistent Cobalt marker. Mobile/tablet: a sticky horizontal chip bar.
 */
export function CategoryRail({ categories }: { categories: Category[] }) {
  const pathname = usePathname();

  return (
    <nav className={styles.rail} aria-label="دسته‌بندی محصولات">
      <ul className={styles.list}>
        {categories.map((cat) => {
          const href = routes.category(cat.slug);
          const active = pathname.startsWith(href);
          return (
            <li key={cat.id} className={styles.item}>
              <Link
                href={href}
                className={styles.link}
                data-active={active ? '' : undefined}
                aria-current={active ? 'page' : undefined}
                data-event="rail_category_click"
                title={cat.name}
              >
                <span className={styles.glyph} aria-hidden="true">
                  <CategoryGlyph iconId={cat.iconId} size={24} />
                </span>
                <span className={styles.name}>{cat.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
