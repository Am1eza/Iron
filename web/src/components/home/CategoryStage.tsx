'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryStage.module.css';

/**
 * Browse by category — the signature interaction (ahanprice-inspired, refined).
 * The category names sit in a fixed list on the RIGHT; hovering one swaps its
 * label for its product image AND shows its preview (sub-categories) on the left.
 * Click → that category's price table. Built for non-technical buyers.
 */
export function CategoryStage({ categories }: { categories: Category[] }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Category | null>(categories[0] ?? null);
  if (!active) return null;

  return (
    <section className={styles.section} aria-labelledby="browse-title">
      <div className={`container ${styles.head}`}>
        <div>
          <p className={styles.eyebrow}>دسته‌بندی محصولات</p>
          <h2 id="browse-title" className={styles.title}>
            قیمت روز آهن‌آلات را ببینید
          </h2>
        </div>
        <p className={styles.hint}>روی هر دسته بروید تا تصویر و زیرشاخه‌ها را ببینید؛ کلیک = جدول قیمت.</p>
      </div>

      <div className={`container ${styles.grid}`}>
        {/* RIGHT (RTL start) — the fixed category rail */}
        <nav className={styles.rail} aria-label="دسته‌بندی محصولات">
          <ul className={styles.railList}>
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={routes.category(cat.slug)}
                  className={styles.railItem}
                  data-active={active.slug === cat.slug ? '' : undefined}
                  onMouseEnter={() => setActive(cat)}
                  onFocus={() => setActive(cat)}
                  data-event="rail_category_click"
                >
                  <span className={styles.railSwap}>
                    <span className={styles.railName}>{cat.name}</span>
                    <span className={styles.railArt} aria-hidden>
                      <CategoryArt slug={cat.slug} size={32} />
                    </span>
                  </span>
                  <ChevronStartIcon size={16} className={`${styles.railChev} icon--rtl`} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* LEFT — live preview of the active category */}
        <div className={styles.preview}>
          <AnimatePresence mode="wait">
            <motion.div
              key={active.slug}
              className={styles.card}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={styles.cardArt}>
                <CategoryArt slug={active.slug} size={104} />
              </span>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>قیمت روز {active.name}</h3>
                <ul className={styles.subs}>
                  {(CATEGORY_SUBS[active.slug] ?? []).map((s, i) => (
                    <motion.li
                      key={s.slug}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduced ? 0 : 0.03 * i, duration: 0.28 }}
                    >
                      <Link href={routes.subCategory(active.slug, s.slug)} className={styles.subChip}>
                        {s.name}
                      </Link>
                    </motion.li>
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
