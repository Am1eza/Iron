'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import type { SubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { ProductImage } from '@/components/catalog/ProductImage';
import { productImage, productThumb } from '@/lib/data/productImages';
import { groupSubCategories } from '@/lib/utils/catalogGroups';
import { FactoryLink } from '@/components/catalog/FactoryLink';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryStage.module.css';

/**
 * Product menu — directly under the AI hero. Editorial hover-reveal list
 * (2026 pattern): the rail is PURE oversized type — no thumbnails — and
 * hovering/focusing a name reveals that category's large product photo in the
 * flyout panel, with its sub-groups and mills beneath. Click a category →
 * its table; a sub-group → that family; a mill → the sub table filtered by it.
 * On touch screens it degrades to a big-name list with a small round photo
 * avatar per row (no sub-group chips — tapping a row goes straight to that
 * category's table, which lists every sub-group itself).
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
  // Category and sub-category names come from the catalog and stay Persian in
  // every locale; only the chrome around them is translated.
  const t = useTranslations('home.browse');
  const firstSub = (slug: string): string => subsMap[slug]?.[0]?.slug ?? '';
  const [activeCat, setActiveCat] = useState<Category | null>(categories[0] ?? null);
  const [activeSub, setActiveSub] = useState<string>(firstSub(categories[0]?.slug ?? ''));
  const activeRailLinkRef = useRef<HTMLAnchorElement | null>(null);
  const firstFlyoutLinkRef = useRef<HTMLAnchorElement | null>(null);
  // WebKit never runs the .panel-in keyframe animation on the panel that's
  // present in the initial server-rendered/hydrated markup — it stays stuck
  // at the 0% keyframe (opacity:0) forever, hiding the whole flyout on first
  // paint. Confirmed: a panel inserted later (e.g. on hover, after mount)
  // animates fine in WebKit too, so the animation class is withheld until
  // after mount and only applied once the user actually switches category.
  const [canAnimate, setCanAnimate] = useState(false);
  useEffect(() => {
    setCanAnimate(true);
  }, []);
  if (!activeCat) return null;

  const subs = subsMap[activeCat.slug] ?? [];
  // Clusters subcategories sharing a `groupLabel` (e.g. «لوله مانیسمان
  // داخلی»/«لوله مانیسمان خارجی» both tagged «مانیسمان») under one heading,
  // same as the admin taxonomy rail / navbar mega-menu / mobile drawer — see
  // lib/utils/catalogGroups.ts. Without this, a newly-added grouped
  // subcategory (freshly created, so it sorts to the end by `order`) doesn't
  // visually surface anywhere near the sibling it's meant to be grouped with.
  // …and, where a cluster's label IS the name of one of its own members
  // («چهارپهلو» over «چهارپهلو» + «چهارپهلو آلیاژی»), promotes that member to
  // BE the heading instead of rendering a dead caption above an identical
  // link — see groupSubCategories.
  const subGroups = groupSubCategories(subs);
  const firstSubSlug = subGroups[0]?.lead?.slug ?? subGroups[0]?.items[0]?.slug;
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
    if (e.key !== 'Tab' || e.shiftKey) return;
    const target = firstFlyoutLinkRef.current;
    // The flyout is `display: none` below 1024px (CategoryStage.module.css).
    // focus() on a non-rendered node is a no-op, but preventDefault() had
    // already cancelled the Tab — so on every tablet and narrowed desktop
    // window a keyboard user reaching this rail was trapped with no way
    // forward to the rest of the page. offsetParent is null exactly when the
    // element (or an ancestor) is display:none, so this bails before
    // swallowing the keystroke.
    if (!target || target.offsetParent === null) return;
    e.preventDefault();
    target.focus();
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
          {t('title')}
        </h2>
      </div>

      <div className={`container ${styles.menu}`}>
        {/* Column 1 — categories (RTL start = right) */}
        <nav className={styles.rail} aria-label={t('railAria')}>
          <ul className={styles.railList}>
            {categories.map((cat) => {
              const hasPhoto = Boolean(productThumb(cat.slug));
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
                    {/* Mobile-only (CSS-gated, see .railAvatar) — the desktop
                        rail is deliberately pure type with the photo reveal
                        doing the visual work; below 1024px that flyout is
                        display:none, so a small round product-photo avatar
                        gives the rail item a visual affordance of its own.
                        Categories with no real product photo yet (see
                        productImages.ts) fall back to the CategoryArt
                        illustration, centered in the same circle. */}
                    <span className={styles.railAvatar} aria-hidden="true">
                      {hasPhoto ? (
                        <ProductImage
                          slug={cat.slug}
                          name={cat.name}
                          variant="thumb"
                          sizes="40px"
                        />
                      ) : (
                        <CategoryArt slug={cat.slug} size={20} />
                      )}
                    </span>
                    <span className={styles.railName}>{cat.name}</span>
                    <ChevronStartIcon size={20} className={`${styles.railChev} icon--rtl`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Columns 2 & 3 — cascade flyout (desktop). Keyed so the CSS fade/slide
            re-runs on each category change (no framer-motion). */}
        <div className={styles.flyout}>
          <div
            key={activeCat.slug}
            className={canAnimate ? `${styles.panel} ${styles.panelAnimate}` : styles.panel}
          >
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
                <p className={styles.colLabel}>{t('subsOf', { name: activeCat.name })}</p>
                {subGroups.map((group) => (
                  <div key={group.label ?? `_solo_${(group.lead ?? group.items[0])!.slug}`}>
                    {group.lead ? (
                      <Link
                        ref={group.lead.slug === firstSubSlug ? firstFlyoutLinkRef : undefined}
                        href={routes.subCategory(activeCat.slug, group.lead.slug)}
                        className={`${styles.subItem} ${styles.subLead}`}
                        data-active={activeSub === group.lead.slug ? '' : undefined}
                        onMouseEnter={() => setActiveSub(group.lead!.slug)}
                        onFocus={() => setActiveSub(group.lead!.slug)}
                        onKeyDown={
                          group.lead.slug === firstSubSlug ? handleFlyoutFirstKeyDown : undefined
                        }
                      >
                        <span>{group.lead.name}</span>
                        <ChevronStartIcon size={14} className={`${styles.subChev} icon--rtl`} />
                      </Link>
                    ) : group.label ? (
                      <p className={styles.subGroupHeading}>{group.label}</p>
                    ) : null}
                    <ul className={styles.colList}>
                      {group.items.map((s) => (
                        <li key={s.slug}>
                          <Link
                            ref={s.slug === firstSubSlug ? firstFlyoutLinkRef : undefined}
                            href={routes.subCategory(activeCat.slug, s.slug)}
                            className={styles.subItem}
                            data-active={activeSub === s.slug ? '' : undefined}
                            onMouseEnter={() => setActiveSub(s.slug)}
                            onFocus={() => setActiveSub(s.slug)}
                            onKeyDown={
                              s.slug === firstSubSlug ? handleFlyoutFirstKeyDown : undefined
                            }
                          >
                            <span>{s.name}</span>
                            <ChevronStartIcon size={14} className={`${styles.subChev} icon--rtl`} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* factories of the active sub-group */}
              <div className={`${styles.col} ${styles.colFactories}`}>
                <p className={styles.colLabel}>کارخانه‌های {activeSubName}</p>
                {/* A mill name goes to that MILL'S page, not to a filtered
                      view of the sub-category we happen to be standing in.
                      `?factory=` produced a query-string URL with no page of
                      its own — nothing canonical, nothing indexable, and a
                      dead end for anyone whose next question is "what else
                      does ذوب‌آهن اصفهان roll?". The per-factory landing
                      pages already exist and every price table already links
                      to them; this was the one surface that didn't. */}
                <ul className={styles.colList}>
                  {mills.map((f) => (
                    <li key={f}>
                      <FactoryLink
                        categorySlug={activeCat.slug}
                        factory={f}
                        className={styles.factoryItem}
                      />
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
