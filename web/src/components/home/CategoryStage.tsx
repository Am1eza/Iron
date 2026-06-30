'use client';
import { useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { ProductImage } from '@/components/catalog/ProductImage';
import { productImage } from '@/lib/data/productImages';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryStage.module.css';

/**
 * Product menu — directly under the AI hero. A three-level cascade revealed on
 * hover/focus: category (rail) → sub-group → factory/mill. Hover a category to
 * open its sub-groups; hover a sub-group to open its mills. Click a category →
 * its table; a sub-group → that family; a mill → the sub table filtered by it.
 * On touch screens it degrades to categories with inline sub-group chips.
 */
type FactoryMap = Record<string, Record<string, string[]>>;

const firstSub = (slug: string): string => CATEGORY_SUBS[slug]?.[0]?.slug ?? '';

export function CategoryStage({
  categories,
  factories,
}: {
  categories: Category[];
  factories: FactoryMap;
}) {
  const [activeCat, setActiveCat] = useState<Category | null>(categories[0] ?? null);
  const [activeSub, setActiveSub] = useState<string>(firstSub(categories[0]?.slug ?? ''));
  if (!activeCat) return null;

  const subs = CATEGORY_SUBS[activeCat.slug] ?? [];
  const mills = factories[activeCat.slug]?.[activeSub] ?? [];
  const activeSubName = subs.find((s) => s.slug === activeSub)?.name ?? '';

  const pickCat = (cat: Category) => {
    setActiveCat(cat);
    setActiveSub(firstSub(cat.slug));
  };

  return (
    <section className={styles.section} aria-labelledby="browse-title">
      <div className={`container ${styles.head}`}>
        <p className={styles.eyebrow}>دسته‌بندی محصولات</p>
        <h2 id="browse-title" className={styles.title}>
          محصول را انتخاب کنید
        </h2>
      </div>

      <div className={`container ${styles.menu}`}>
        {/* Column 1 — categories (RTL start = right) */}
        <nav className={styles.rail} aria-label="دسته‌بندی محصولات">
          <ul className={styles.railList}>
            {categories.map((cat) => {
              const catSubs = CATEGORY_SUBS[cat.slug] ?? [];
              return (
                <li key={cat.id} className={styles.railLi}>
                  <Link
                    href={routes.category(cat.slug)}
                    className={styles.railItem}
                    data-active={activeCat.slug === cat.slug ? '' : undefined}
                    onMouseEnter={() => pickCat(cat)}
                    onFocus={() => pickCat(cat)}
                    data-event="rail_category_click"
                  >
                    <span className={styles.railThumb} aria-hidden>
                      {productImage(cat.slug) ? (
                        <ProductImage slug={cat.slug} name={cat.name} variant="thumb" />
                      ) : (
                        <CategoryArt slug={cat.slug} size={28} />
                      )}
                    </span>
                    <span className={styles.railName}>{cat.name}</span>
                    <ChevronStartIcon size={16} className={`${styles.railChev} icon--rtl`} />
                  </Link>

                  {/* inline sub-groups — shown on touch/small screens (CSS) */}
                  <ul className={styles.inlineSubs}>
                    {catSubs.map((s) => (
                      <li key={s.slug}>
                        <Link
                          href={routes.subCategory(cat.slug, s.slug)}
                          className={styles.inlineSub}
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Columns 2 & 3 — cascade flyout (desktop). Keyed so the CSS fade/slide
            re-runs on each category change (no framer-motion). */}
        <div className={styles.flyout}>
            <div key={activeCat.slug} className={styles.panel}>
              <div className={styles.cols}>
                {/* sub-groups */}
                <div className={styles.col}>
                  <p className={styles.colLabel}>زیرشاخه‌های {activeCat.name}</p>
                  <ul className={styles.colList}>
                    {subs.map((s) => (
                      <li key={s.slug}>
                        <Link
                          href={routes.subCategory(activeCat.slug, s.slug)}
                          className={styles.subItem}
                          data-active={activeSub === s.slug ? '' : undefined}
                          onMouseEnter={() => setActiveSub(s.slug)}
                          onFocus={() => setActiveSub(s.slug)}
                        >
                          <span>{s.name}</span>
                          <ChevronStartIcon size={14} className={`${styles.subChev} icon--rtl`} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* factories of the active sub-group */}
                <div className={`${styles.col} ${styles.colFactories}`}>
                  <p className={styles.colLabel}>
                    کارخانه‌های {activeSubName}
                  </p>
                  <ul className={styles.colList}>
                    {mills.map((f) => (
                      <li key={f}>
                        <Link
                          href={`${routes.subCategory(activeCat.slug, activeSub)}?factory=${encodeURIComponent(f)}`}
                          className={styles.factoryItem}
                        >
                          {f}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <Link href={routes.category(activeCat.slug)} className={styles.cta}>
                مشاهده جدول قیمت {activeCat.name}
                <ChevronStartIcon size={18} className="icon--rtl" />
              </Link>
            </div>
        </div>
      </div>
    </section>
  );
}
