'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryGlyph, SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './MegaMenu.module.css';

/**
 * N3 · «محصولات» mega-menu — a full-width panel with 7 category columns plus a
 * trailing «بپرس از پولادین» AI column. The current category's column is highlighted.
 */
export function MegaMenu({
  categories,
  onNavigate,
}: {
  categories: Category[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className={styles.panel} role="menu" aria-label="محصولات">
      <div className={`container ${styles.grid}`}>
        {categories.map((cat) => {
          const active = pathname.startsWith(routes.category(cat.slug));
          return (
            <div key={cat.id} className={styles.col} data-active={active ? '' : undefined}>
              <Link
                href={routes.category(cat.slug)}
                className={styles.colHead}
                role="menuitem"
                onClick={onNavigate}
                data-event="rail_category_click"
              >
                <span className={styles.glyph}>
                  <CategoryGlyph iconId={cat.iconId} size={22} />
                </span>
                {cat.name}
              </Link>
              <ul className={styles.subs}>
                {(CATEGORY_SUBS[cat.slug] ?? []).map((sub) => (
                  <li key={sub.slug}>
                    <Link
                      href={routes.subCategory(cat.slug, sub.slug)}
                      className={styles.subLink}
                      role="menuitem"
                      onClick={onNavigate}
                    >
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={routes.category(cat.slug)}
                className={styles.dayPrice}
                role="menuitem"
                onClick={onNavigate}
              >
                قیمت روز
                <ChevronStartIcon size={14} className="icon--rtl" />
              </Link>
            </div>
          );
        })}

        {/* AI column */}
        <div className={`${styles.col} ${styles.aiCol}`}>
          <p className={styles.aiTitle}>
            <SparkIcon size={18} className={styles.aiSpark} />
            بپرس از پولادین
          </p>
          <p className={styles.aiText}>
            نمی‌دانی چه بخری؟ مشاور هوشمند، بر پایهٔ قیمت‌های واقعی، بهترین انتخاب را پیشنهاد می‌دهد.
          </p>
          <Link
            href={routes.ai()}
            className={styles.aiCta}
            role="menuitem"
            onClick={onNavigate}
            data-event="ai_entry"
          >
            شروع گفتگو
            <ChevronStartIcon size={16} className="icon--rtl" />
          </Link>
        </div>
      </div>
    </div>
  );
}
