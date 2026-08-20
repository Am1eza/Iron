'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import type { SubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import { ProductImage } from '@/components/catalog/ProductImage';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { productImage } from '@/lib/data/productImages';
import { groupSubCategories } from '@/lib/utils/catalogGroups';
import { toPersianDigits } from '@/lib/utils/format';
import { ChevronStartIcon } from '@/components/primitives/icons';
import { NavDropdown } from './NavDropdown';
import styles from './ProductsMenu.module.css';

/**
 * «محصولات» desktop mega-menu — a category RAIL beside one category's panel,
 * not nine simultaneous columns.
 *
 * The flat-columns version it replaces put all nine top-level categories side
 * by side in one grid. That layout is a function of the catalog's shape, and
 * the shape is hostile to it: نبشی و ناودانی has 3 sub-categories and ورق has
 * 19, so the columns differed in height by a factor of six, and the rows below
 * the first only existed inside a 720px scroll box with no affordance saying
 * so. On a laptop viewport استیل and فلزات رنگی — two entire product lines —
 * were simply never seen. Every extra sub-category made it worse, and the
 * catalog is still growing.
 *
 * The rail is height-independent: nine fixed-height rows, always all visible,
 * whatever any category contains. Only the active category's sub-categories
 * are laid out, so their count drives a local multi-column flow (`columns` in
 * CSS, which balances 3 and 19 alike) instead of the height of the whole
 * panel. A category with 80 sub-categories widens its own flow and, past the
 * panel height, scrolls its own pane — it cannot push a sibling off-screen.
 *
 * This is also the pattern the homepage's own CategoryStage already uses, so
 * it is the site's established idiom rather than a new one to learn, and it is
 * how the Iranian steel-price sites the owner benchmarks against (ahanonline's
 * grouped nested lists per primary category) organise the same taxonomy.
 *
 * Interaction is deliberately conventional: hover or focus a rail row to
 * switch the panel, click it to go to that category's price table. Nothing
 * here needs explaining to someone who has used a shop menu before.
 *
 * ── Crawlability ──
 * Every panel is in the DOM on every page, `hidden` when inactive, so the
 * whole taxonomy — ~9 category URLs and ~80 sub-category URLs, each with its
 * own Persian product name as the anchor text — is one crawlable internal-link
 * surface. Previously this component was `ssr: false` AND mounted on open, so
 * a crawler (or an answer engine building "what does آهن‌تایم sell?") saw
 * nothing at all: the homepage HTML carried category links but only ONE
 * category's sub-category links.
 */
export function ProductsMenu({ categories, subs }: { categories: Category[]; subs: SubsMap }) {
  const pathname = usePathname();

  // Open on whatever the visitor is already looking at, so the menu confirms
  // where they are rather than resetting them to میلگرد from a ورق page.
  const currentSlug = useMemo(() => {
    const match = categories.find((c) => {
      const base = routes.category(c.slug);
      return pathname === base || pathname?.startsWith(`${base}/`);
    });
    return match?.slug ?? categories[0]?.slug ?? null;
  }, [categories, pathname]);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const active = activeSlug ?? currentSlug;

  // Drop the hovered selection on navigation, so re-opening the menu on the
  // new page shows that page's category rather than whatever the pointer last
  // brushed past on the previous one.
  useEffect(() => setActiveSlug(null), [pathname]);

  const railRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const layoutRef = useRef<HTMLDivElement | null>(null);

  /**
   * Keyboard order follows the layout, not the DOM.
   *
   * Every panel is a sibling of the whole rail (it has to be — the rail is one
   * grid column and the panels share the other), so raw DOM order would send
   * Tab through all nine rail rows and only then into whichever panel happened
   * to be showing at the end. Redirected, Tab reads the way the menu looks:
   * میلگرد → میلگرد's sub-categories → تیرآهن → تیرآهن's sub-categories → …
   * Focus landing on the next rail row switches the panel through the same
   * `onFocus` a pointer would, so nothing special is needed to keep them in
   * step.
   *
   * `offsetParent === null` is the "this menu is closed" test — `hidden` is a
   * `display: none`, focus() on it is a silent no-op, and preventDefault()
   * without a successful focus() would swallow the Tab and strand the user.
   */
  const visibleLinks = (): HTMLElement[] => {
    const panel = layoutRef.current?.querySelector<HTMLElement>('[data-active-panel]');
    if (!panel || panel.offsetParent === null) return [];
    return [...panel.querySelectorAll<HTMLElement>('a[href]')];
  };

  const onRailKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    const first = visibleLinks()[0];
    if (!first) return;
    e.preventDefault();
    first.focus();
  };

  const onPanelKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'Tab') return;
    const links = visibleLinks();
    if (links.length === 0) return;
    if (e.shiftKey && e.target === links[0]) {
      const rail = active ? railRefs.current[active] : null;
      if (!rail) return;
      e.preventDefault();
      rail.focus();
      return;
    }
    if (!e.shiftKey && e.target === links[links.length - 1]) {
      const next = categories[index + 1];
      const rail = next ? railRefs.current[next.slug] : null;
      if (!rail) return;
      e.preventDefault();
      rail.focus();
    }
  };

  if (categories.length === 0) return null;

  return (
    <NavDropdown label="محصولات" mega keepMounted panelLabel="دسته‌بندی محصولات">
      <div className={styles.layout} ref={layoutRef}>
        {/* The rail is a real <nav> landmark with its own name: it is a
            standing list of the site's product lines, which is exactly the
            question an answer engine asks of a marketplace. */}
        <nav className={styles.rail} aria-label="دسته‌بندی‌های اصلی">
          <ul className={styles.railList}>
            {categories.map((cat) => {
              const count = subs[cat.slug]?.length ?? 0;
              return (
                <li key={cat.id}>
                  <Link
                    ref={(el) => {
                      railRefs.current[cat.slug] = el;
                    }}
                    href={routes.category(cat.slug)}
                    className={styles.railItem}
                    data-active={cat.slug === active ? '' : undefined}
                    aria-current={cat.slug === currentSlug ? 'true' : undefined}
                    onMouseEnter={() => setActiveSlug(cat.slug)}
                    onFocus={() => setActiveSlug(cat.slug)}
                    onKeyDown={cat.slug === active ? onRailKeyDown : undefined}
                  >
                    <span className={styles.railThumb} aria-hidden="true">
                      {productImage(cat.slug) ? (
                        <ProductImage slug={cat.slug} name={cat.name} variant="thumb" />
                      ) : (
                        <CategoryArt slug={cat.slug} size={22} />
                      )}
                    </span>
                    <span className={styles.railName}>{cat.name}</span>
                    {count > 0 && (
                      <span className={styles.railCount}>
                        {toPersianDigits(count)}
                        <span className="visually-hidden"> زیردسته</span>
                      </span>
                    )}
                    <ChevronStartIcon size={14} className={`${styles.railChev} icon--rtl`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {categories.map((cat, i) => (
          <CategoryPanel
            key={cat.id}
            cat={cat}
            subs={subs[cat.slug] ?? []}
            hidden={cat.slug !== active}
            onKeyDown={(e) => onPanelKeyDown(e, i)}
          />
        ))}
      </div>
    </NavDropdown>
  );
}

/**
 * One category's pane. Rendered for every category regardless of which is
 * active — `hidden` is what makes it invisible, and `hidden` still leaves the
 * links in the document for a crawler while removing them from the tab order
 * for a keyboard user (see NavDropdown's `keepMounted` note).
 */
function CategoryPanel({
  cat,
  subs,
  hidden,
  onKeyDown,
}: {
  cat: Category;
  subs: SubsMap[string];
  hidden: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  const groups = groupSubCategories(subs);

  return (
    <div
      className={styles.panel}
      hidden={hidden}
      data-active-panel={hidden ? undefined : ''}
      onKeyDown={onKeyDown}
    >
      <div className={styles.panelHead}>
        <div className={styles.panelHeadRow}>
          {/* A real heading, not styled text: the panel is a named section of
              the navigation and both a screen reader and a parser should be
              able to tell that «ورق» heads the list of ورق sub-categories. */}
          <h2 className={styles.panelTitle}>{cat.name}</h2>
          {/* Descriptive link text — «قیمت روز ورق» says what is on the other
              side of the click; a generic «مشاهده» says nothing to a reader
              scanning, and nothing to an answer engine reading anchor text. */}
          <Link href={routes.category(cat.slug)} className={styles.panelAll}>
            قیمت روز {cat.name}
            <ChevronStartIcon size={14} className="icon--rtl" />
          </Link>
        </div>
        {/* The admin-authored line for this product line — what it is and who
            buys it. Deliberately ONE clamped line: it sits above a flow that
            can be nineteen sub-categories long, and a paragraph here would
            compete with the list the menu exists to show. The same string
            goes into `catalogNavigationJsonLd`, so the sentence a reader sees
            and the one an answer engine lifts are the same sentence. Rendered
            only when set — there is no generated fallback. */}
        {cat.description ? <p className={styles.panelLede}>{cat.description}</p> : null}
      </div>

      <div className={styles.panelBody}>
        {/* The category's own product photo. Not decoration for its own sake:
            a multi-column list only ever fills the width it is given, so a
            3-sub-category panel spread across the full menu read as scattered
            orphans. Giving the flow a bounded column and the leftover width a
            picture makes نبشی و ناودانی and ورق both look like a designed
            panel, and it is the same hover-reveal the homepage's CategoryStage
            already does — an established idiom here, not a new one. Decorative:
            the heading beside it is the label, so it is hidden from AT. */}
        <div className={styles.panelArt} aria-hidden="true">
          {productImage(cat.slug) ? (
            <ProductImage
              slug={cat.slug}
              name={cat.name}
              variant="full"
              sizes="(min-width: 1024px) 260px, 0px"
            />
          ) : (
            <span className={styles.panelArtFallback}>
              <CategoryArt slug={cat.slug} size={64} />
            </span>
          )}
        </div>

        {subs.length === 0 ? (
          <p className={styles.panelEmpty}>
            زیردسته‌ای برای {cat.name} ثبت نشده است؛ جدول قیمت این دسته را ببینید.
          </p>
        ) : (
          <ul
            className={styles.groups}
            data-cols={groups.length <= 4 ? '1' : groups.length <= 9 ? '2' : '3'}
          >
          {groups.map((group) => {
            const key = group.label ?? `_solo_${(group.lead ?? group.items[0])!.slug}`;
            return (
              <li key={key} className={styles.group}>
                {/* Three shapes, one rule: a group whose label IS one of its
                    members is headed by that member as a LINK (چهارپهلو →
                    چهارپهلو آلیاژی); a group whose label is a family name
                    nothing is called (مانیسمان) is headed by that label as
                    text; an ungrouped item is just its own link. What must
                    never happen again is a dead «چهارپهلو» caption sitting on
                    top of a «چهارپهلو» link. */}
                {group.lead ? (
                  <Link
                    href={routes.subCategory(cat.slug, group.lead.slug)}
                    className={`${styles.sub} ${styles.groupHead}`}
                  >
                    {group.lead.name}
                  </Link>
                ) : group.label ? (
                  <p className={styles.groupLabel}>{group.label}</p>
                ) : null}

                <ul className={group.label ? styles.subListNested : styles.subList}>
                  {group.items.map((s) => (
                    <li key={s.slug}>
                      <Link href={routes.subCategory(cat.slug, s.slug)} className={styles.sub}>
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}
