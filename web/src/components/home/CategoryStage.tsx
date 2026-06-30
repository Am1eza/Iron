'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { ProductImage } from '@/components/catalog/ProductImage';
import { productImage } from '@/lib/data/productImages';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryStage.module.css';

/**
 * Product menu — placed directly under the AI hero. A single category column
 * (the rail) on the RTL start; hovering/focusing a row opens a sub-group flyout
 * panel beside it (photo + sub-groups + «جدول قیمت» CTA). Click a row → that
 * category's price table. On touch screens the flyout collapses to inline
 * sub-group chips under each row. Mega-menu inspired, kept clean.
 */
export function CategoryStage({ categories }: { categories: Category[] }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Category | null>(categories[0] ?? null);
  if (!active) return null;
  const subs = CATEGORY_SUBS[active.slug] ?? [];

  return (
    <section className={styles.section} aria-labelledby="browse-title">
      <div className={`container ${styles.head}`}>
        <p className={styles.eyebrow}>دسته‌بندی محصولات</p>
        <h2 id="browse-title" className={styles.title}>
          محصول را انتخاب کنید
        </h2>
      </div>

      <div className={`container ${styles.menu}`}>
        {/* category column (RTL start = right) */}
        <nav className={styles.rail} aria-label="دسته‌بندی محصولات">
          <ul className={styles.railList}>
            {categories.map((cat) => {
              const catSubs = CATEGORY_SUBS[cat.slug] ?? [];
              return (
                <li key={cat.id} className={styles.railLi}>
                  <Link
                    href={routes.category(cat.slug)}
                    className={styles.railItem}
                    data-active={active.slug === cat.slug ? '' : undefined}
                    onMouseEnter={() => setActive(cat)}
                    onFocus={() => setActive(cat)}
                    data-event="rail_category_click"
                  >
                    <span className={styles.railThumb} aria-hidden>
                      {productImage(cat.slug) ? (
                        <ProductImage slug={cat.slug} name={cat.name} />
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

        {/* flyout panel — desktop (hover/focus opens the active category's subs) */}
        <div className={styles.panelWrap}>
          <AnimatePresence mode="wait">
            <motion.div
              key={active.slug}
              className={styles.panel}
              initial={{ opacity: 0, x: reduced ? 0 : 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduced ? 0 : -10 }}
              transition={{ duration: reduced ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={styles.panelArt}>
                {productImage(active.slug) ? (
                  <ProductImage slug={active.slug} name={active.name} eager />
                ) : (
                  <CategoryArt slug={active.slug} size={96} />
                )}
              </span>
              <div className={styles.panelBody}>
                <h3 className={styles.panelTitle}>قیمت روز {active.name}</h3>
                <ul className={styles.panelSubs}>
                  {subs.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={routes.subCategory(active.slug, s.slug)}
                        className={styles.panelSub}
                      >
                        <ChevronStartIcon size={14} className={`${styles.subChev} icon--rtl`} />
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={routes.category(active.slug)} className={styles.cta}>
                  مشاهده جدول قیمت {active.name}
                  <ChevronStartIcon size={18} className="icon--rtl" />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
