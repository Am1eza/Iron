import Link from 'next/link';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryGlyph, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryGrid.module.css';

/** Home «structured door» — the 7 categories as cards (mirrors the rail/mega-menu). */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <section className={styles.section} aria-labelledby="cat-grid-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>دسته‌بندی محصولات</p>
          <h2 id="cat-grid-title" className={styles.title}>
            قیمت روز آهن‌آلات
          </h2>
        </div>
        <Link href={routes.prices()} className={styles.all}>
          همهٔ قیمت‌ها
          <ChevronStartIcon size={16} className="icon--rtl" />
        </Link>
      </header>

      <ul className={styles.grid}>
        {categories.map((cat) => (
          <li key={cat.id}>
            <Link
              href={routes.category(cat.slug)}
              className={styles.card}
              data-event="rail_category_click"
            >
              <span className={styles.glyph}>
                <CategoryGlyph iconId={cat.iconId} size={32} />
              </span>
              <span className={styles.name}>{cat.name}</span>
              <span className={styles.subs}>
                {(CATEGORY_SUBS[cat.slug] ?? []).slice(0, 3).join(' · ')}
              </span>
              <span className={styles.cta} aria-hidden="true">
                مشاهده قیمت
                <ChevronStartIcon size={14} className="icon--rtl" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
