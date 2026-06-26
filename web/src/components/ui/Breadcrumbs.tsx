import Link from 'next/link';
import { ChevronEndIcon } from '@/components/primitives/icons';
import styles from './Breadcrumbs.module.css';

export type Crumb = { label: string; href?: string };

/**
 * D5 · Breadcrumbs — «خانه › … › current». The last item is the current page
 * (non-link, `aria-current`). Separators mirror for RTL via `.icon--rtl`.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="مسیر صفحه" className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={styles.item}>
              {item.href && !last ? (
                <Link href={item.href} className={styles.link}>
                  {item.label}
                </Link>
              ) : (
                <span className={styles.current} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? (
                <ChevronEndIcon size={14} className={`${styles.sep} icon--rtl`} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
