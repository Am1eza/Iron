'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import type { SubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { ProductImage } from '@/components/catalog/ProductImage';
import { productImage } from '@/lib/data/productImages';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryStage.module.css';

/**
 * Product menu — directly under the AI hero. Editorial hover-reveal list
 * (2026 pattern): the rail is PURE oversized type — no thumbnails — and
 * hovering/focusing a name reveals that category's large product photo in the
 * flyout panel, with its sub-groups and mills beneath. Click a category →
 * its table; a sub-group → that family; a mill → the sub table filtered by it.
 * On touch screens it degrades to big names with inline sub-group chips (no
 * hover dead-ends). Reduced-motion: the crossfade/slide is disabled.
 */
type FactoryMap = Record<string, Record<string, string[]>>;



export function CategoryStage({
  categories,
  subs: subsMap,
  factories,
}: {
  categories: Category[];
  subs: SubsMap;
  factories: FactoryMap;
}) {
  const firstSub = (slug: string): string => subsMap[slug]?.[0]?.slug ?? '';
  const [activeCat, setActiveCat] = useState<Category | null>(categories[0] ?? null);
  const [activeSub, setActiveSub] = useState<string>(firstSub(categories[0]?.slug ?? ''));
  const activeRailLinkRef = useRef<HTMLAnchorElement | null>(null);
  const firstFlyoutLinkRef = useRef<HTMLAnchorElement | null>(null);
  if (!activeCat) return null;

  const subs = subsMap[activeCat.slug] ?? [];
  const mills = factories[activeCat.slug]?.[activeSub] ?? [];
  const activeSubName = subs.find((s) => s.slug === activeSub)?.name ?? '';

  const pickCat = (cat: Category) => {
    setActiveCat(cat);
    setActiveSub(firstSub(cat.slug));
  };

  // The flyout is one shared block positioned after the whole rail <ul> (so
  // its visual position can track whichever category is active), not nested
  // inside each <li> — which means Tab would normally jump straight from one
  // rail item to the next, skipping the flyout's sub-category/factory links
  // entirely. Redirect focus explicitly so keyboard order follows the logical
  // (not DOM) order: rail item → that item's flyout → next rail item.
  const handleRailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey && firstFlyoutLinkRef.current) {
      e.preventDefault();
      firstFlyoutLinkRef.current.focus();
    }
  };
  const handleFlyoutFirstKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      activeRailLinkRef.current?.focus();
    }
  };

  return (
    <section className={styles.section} aria-labelledby="browse-title">
      <div className={`container ${styles.head}`}>
        <h2 id="browse-title" className={styles.title}>
          محصول را انتخاب کنید
        </h2>
      </div>

      <div className={`container ${styles.menu}`}>
        {/* Column 1 — categories (RTL start = right) */}
        <nav className={styles.rail} aria-label="دسته‌بندی محصولات">
          <ul className={styles.railList}>
            {categories.map((cat) => {
              const catSubs = subsMap[cat.slug] ?? [];
              return (
                <li key={cat.id} className={styles.railLi}>
                  {/* Names ONLY — the photo reveals in the flyout on hover/focus
                      (editorial hover-reveal; no thumb+name duplication). */}
                  <Link
                    ref={activeCat.slug === cat.slug ? activeRailLinkRef : undefined}
                    href={routes.category(cat.slug)}
                    className={styles.railItem}
                    data-active={activeCat.slug === cat.slug ? '' : undefined}
                    onMouseEnter={() => pickCat(cat)}
                    onFocus={() => pickCat(cat)}
                    onKeyDown={activeCat.slug === cat.slug ? handleRailKeyDown : undefined}
                    data-event="rail_category_click"
                  >
                    <span className={styles.railName}>{cat.name}</span>
                    <ChevronStartIcon size={20} className={`${styles.railChev} icon--rtl`} />
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
              {/* The hover-reveal: the active category's large product photo.
                  Decorative (the rail name IS the label) — hidden from AT. */}
              <div className={styles.photo} aria-hidden="true">
                {productImage(activeCat.slug) ? (
                  // The flyout is at most ~720px wide (and full-width on the
                  // mobile layout), so tell the browser that instead of
                  // letting it assume full-bleed and always fetch the 1200px
                  // file for a box this size.
                  <ProductImage
                    slug={activeCat.slug}
                    name={activeCat.name}
                    variant="full"
                    eager
                    sizes="(min-width: 1100px) 700px, 100vw"
                  />
                ) : (
                  <span className={styles.photoFallback}>
                    <CategoryArt slug={activeCat.slug} size={72} />
                  </span>
                )}
              </div>
              <div className={styles.cols}>
                {/* sub-groups */}
                <div className={styles.col}>
                  <p className={styles.colLabel}>زیرشاخه‌های {activeCat.name}</p>
                  <ul className={styles.colList}>
                    {subs.map((s, i) => (
                      <li key={s.slug}>
                        <Link
                          ref={i === 0 ? firstFlyoutLinkRef : undefined}
                          href={routes.subCategory(activeCat.slug, s.slug)}
                          className={styles.subItem}
                          data-active={activeSub === s.slug ? '' : undefined}
                          onMouseEnter={() => setActiveSub(s.slug)}
                          onFocus={() => setActiveSub(s.slug)}
                          onKeyDown={i === 0 ? handleFlyoutFirstKeyDown : undefined}
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
