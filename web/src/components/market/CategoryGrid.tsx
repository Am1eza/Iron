'use client';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import type { SubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import { CategoryGlyph, ChevronStartIcon } from '@/components/primitives/icons';
import { ProductImage } from '@/components/catalog/ProductImage';
import { productImage } from '@/lib/data/productImages';
import styles from './CategoryGrid.module.css';

/** Home «structured door» — the 7 categories as cards (mirrors the rail/mega-menu). */
export function CategoryGrid({ categories, subs }: { categories: Category[]; subs: SubsMap }) {
  const t = useTranslations('categoryGrid');
  const locale = useLocale() as AppLocale;
  return (
    <section className={styles.section} aria-labelledby="cat-grid-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 id="cat-grid-title" className={styles.title}>
            {t('title')}
          </h2>
        </div>
        <Link href={routes.prices()} className={styles.all}>
          {t('allPrices')}
          <ChevronStartIcon size={16} className="icon--rtl" />
        </Link>
      </header>

      <ul className={styles.grid}>
        {categories.map((cat) => {
          const catName = getLocalizedName(cat, locale);
          return (
            <li key={cat.id}>
              <Link
                href={routes.category(cat.slug)}
                className={styles.card}
                data-event="rail_category_click"
              >
                <span className={styles.media} aria-hidden>
                  {productImage(cat.slug) ? (
                    // `.media` renders this at ~124px tall — the full 1200×800
                    // photo was ~8.5× more bytes than the pre-generated thumb
                    // needs, and this grid is above the fold on both `/` and
                    // `/prices`, so it's eager too (not lazy-loaded off-screen
                    // content).
                    <ProductImage slug={cat.slug} name={catName} variant="thumb" eager />
                  ) : (
                    <CategoryGlyph iconId={cat.iconId} size={32} />
                  )}
                </span>
                <span className={styles.name}>{catName}</span>
                <span className={styles.subs}>
                  {(subs[cat.slug] ?? [])
                    .slice(0, 3)
                    .map((s) => getLocalizedName(s, locale))
                    .join(' · ')}
                </span>
                <span className={styles.cta} aria-hidden="true">
                  {t('viewPrice')}
                  <ChevronStartIcon size={14} className="icon--rtl" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
