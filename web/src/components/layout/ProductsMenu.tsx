'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import type { SubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import { ProductImage } from '@/components/catalog/ProductImage';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { SubCategoryArt } from '@/components/catalog/SubCategoryArt';
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

  /**
   * Pointer-driven panel switching, but never OUT FROM UNDER a keyboard user.
   *
   * Swapping `active` gives the old panel `hidden` — a `display: none` — and
   * the browser then drops focus to `<body>` if it was on one of that panel's
   * links. A keyboard user who has pinned the menu open and tabbed into ورق's
   * sub-list is thrown out of the document's flow entirely by a stray
   * trackpad brush across «تیرآهن», with nothing announced.
   *
   * The test is "does this menu currently hold focus" — the trigger lives
   * outside `layoutRef`, so a mouse user who clicked it to pin the menu open
   * still gets hover switching.
   */
  const hoverSelect = (slug: string) => {
    if (layoutRef.current?.contains(document.activeElement)) return;
    setActiveSlug(slug);
  };

  const onRailKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      // Backwards, the layout order is rail(i) → panel(i-1)'s LAST link. Left
      // native, Shift+Tab went rail(i) → rail(i-1) and there was no keyboard
      // path back into a panel at all: a user who overshot the last
      // sub-category of ورق by one Tab could not get back to it.
      const prev = categories[index - 1];
      if (!prev) return;
      // The previous panel is `hidden` until it is the active one, and
      // focus() on a `display: none` element is a silent no-op — so the swap
      // has to be flushed to the DOM before the focus call, not queued behind
      // it.
      flushSync(() => setActiveSlug(prev.slug));
      const links = visibleLinks();
      const last = links[links.length - 1];
      if (!last) return;
      e.preventDefault();
      last.focus();
      return;
    }
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
            {categories.map((cat, i) => {
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
                    onMouseEnter={() => hoverSelect(cat.slug)}
                    onFocus={() => setActiveSlug(cat.slug)}
                    onKeyDown={(e) => onRailKeyDown(e, i)}
                  >
                    <span className={styles.railThumb} aria-hidden="true">
                      {productImage(cat.slug) ? (
                        <ProductImage slug={cat.slug} name={cat.name} variant="thumb" />
                      ) : (
                        <CategoryArt slug={cat.slug} size={22} />
                      )}
                    </span>
                    <span className={styles.railName}>{cat.name}</span>
                    {/* The sub-category count, for screen readers ONLY. It used
                        to be a visible pill beside every rail row, and it was
                        internal metadata leaking into the shop: nobody picks
                        ورق over نبشی because one says ۱۹ and the other ۳. What
                        it IS still worth is telling a non-sighted user how much
                        is behind a row before they open it, which is exactly
                        what `visually-hidden` text is for. */}
                    {count > 0 && (
                      <span className="visually-hidden">، {toPersianDigits(count)} زیردسته</span>
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
 * How many columns the sub-category flow gets, from the number of lines it
 * will draw. Thresholds are unchanged from the pre-grouping version (≤4 → one,
 * ≤9 → two, else three) — only the number fed into them is now correct for a
 * grouped list. Kept out of the component so a test can assert the boundaries
 * without rendering a menu.
 */
export function columnsFor(rows: number, blocks: number = rows): '1' | '2' | '3' {
  const wanted = rows <= 4 ? 1 : rows <= 9 ? 2 : 3;
  // …then capped by how many UNBREAKABLE blocks there are to distribute.
  // `.group` is `break-inside: avoid`, so a category that clusters into two
  // groups can only ever fill two columns however many lines those groups
  // hold. Asking for three leaves the third empty and — since `data-cols=3`
  // is the one bucket with no width cap — spreads the two lists a third of a
  // panel apart. فلزات رنگی (13 items → 15 lines, but only آلومینیوم and مس
  // as blocks) is exactly that case. `blocks` defaults to `rows` so an
  // ungrouped category, where every line IS its own block, is unaffected.
  const cols = Math.min(wanted, Math.max(1, blocks));
  return String(cols) as '1' | '2' | '3';
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
  /**
   * Column count is a function of how many LINES the flow will draw, not of
   * how many groups it has. Before grouping was populated the two were the
   * same number and `groups.length` was right by accident; the moment ورق's
   * nineteen rows collapsed into five labelled groups, that expression asked
   * for a single 16rem column and stacked twenty-four lines down a panel that
   * caps at 34rem — the exact "scrolls in a box with no affordance" failure
   * the rail was built to end. A labelled group costs one line for its own
   * heading plus one per member; an unlabelled singleton costs one.
   */
  const rows = groups.reduce((n, g) => n + g.items.length + (g.label ? 1 : 0), 0);

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
        {/* The category's own product photo — ONE deliberate focal point, not
            an inset thumbnail beside a denser thing.

            It used to be a fixed 16rem 4:3 card pinned to the far edge, and
            once #215 turned the list beside it into five headed groups with
            icons the panel had two competing centres of attention and a hole
            between them: on نبشی و ناودانی, three links occupied 16rem, the
            picture another 16rem, and ~470px of the panel was simply empty.

            So the picture takes the leftover width instead of a fixed slice of
            it, and stretches to the height of the list beside it. On ورق it
            settles to its ~20rem floor and the nineteen sub-categories get the
            reading edge; on نبشی و ناودانی it grows into the space the three
            links do not want and the panel reads as one designed surface at
            both extremes. The alternative — dropping the photo and letting
            typography carry the panel, Apple-style — fixes the competition but
            makes the small-category hole worse, and this catalog's whole
            problem is that its categories differ in depth by 6×.

            Decorative: the heading beside it is the label, so it is hidden
            from AT. */}
        <div className={styles.panelArt} aria-hidden="true">
          {productImage(cat.slug) ? (
            <ProductImage
              slug={cat.slug}
              name={cat.name}
              variant="full"
              sizes="(min-width: 1024px) 30vw, 0px"
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
          <ul className={styles.groups} data-cols={columnsFor(rows, groups.length)}>
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
                      <span className={styles.subIcon} aria-hidden="true">
                        <SubCategoryArt
                          categorySlug={cat.slug}
                          slug={group.lead.slug}
                          name={group.lead.name}
                          size={16}
                        />
                      </span>
                      {group.lead.name}
                    </Link>
                  ) : group.label ? (
                    <p className={styles.groupLabel}>
                      {/* A group whose label names no member of its own
                          («ورق‌های روکش‌دار») still gets the group's glyph, so
                          the five ورق groups read as five marked sections
                          rather than as five unmarked ones beside two marked
                          ones. The glyph is resolved from the group's FIRST
                          MEMBER, not from the label: resolution is name-first,
                          and every ورق group label contains the word «ورق», so
                          labels alone would draw the same plate five times.
                          `sheet/galvanized` resolves to the coated-plate glyph,
                          `sheet/deck` to the decking one. */}
                      <span className={styles.subIcon} aria-hidden="true">
                        <SubCategoryArt
                          categorySlug={cat.slug}
                          slug={group.items[0]!.slug}
                          name={group.items[0]!.name}
                          size={16}
                        />
                      </span>
                      {group.label}
                    </p>
                  ) : null}

                  {/* A labelled group whose ONLY member is named after the
                      label leaves `items` empty once the lead is promoted.
                      Not reachable with today's data, but `group_label` is
                      admin-editable, and an empty <ul> announces as "list, 0
                      items" and still paints its leader rule. */}
                  {group.items.length > 0 && (
                    <ul className={group.label ? styles.subListNested : styles.subList}>
                      {group.items.map((s) => (
                        <li key={s.slug}>
                          <Link href={routes.subCategory(cat.slug, s.slug)} className={styles.sub}>
                            {/* The section drawing, at GROUP level only.
                                #215 drew one on every leaf, which at ورق's
                                nineteen rows stopped being a scanning aid and
                                became texture — nineteen small marks competing
                                with the nineteen names they were meant to
                                serve. An icon earns its place where it labels
                                a SECTION, so it is drawn on the group head
                                above (link or label) and, here, only where the
                                row IS its own section: an ungrouped item is a
                                one-member group, so «پروفیل Z» and all three
                                of نبشی و ناودانی keep theirs and lose nothing.
                                Decorative either way — the Persian name beside
                                it is the link's whole accessible name. */}
                            {group.label === null && (
                              <span className={styles.subIcon} aria-hidden="true">
                                <SubCategoryArt
                                  categorySlug={cat.slug}
                                  slug={s.slug}
                                  name={s.name}
                                  size={16}
                                />
                              </span>
                            )}
                            {s.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
