'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import {
  formatToman,
  priceHiddenLabel,
  toPersianDigits,
  normalizeDigits,
  withVat,
} from '@/lib/utils/format';
import {
  sizeLabel,
  weightLabel,
  usesDimensions,
  dimensionsLabel,
  attributeColumns,
  type AttrColumn,
  groupModeFor,
  groupKeyFor,
  factoryLabel,
  sectionSubject,
  REGION_LABEL,
  UNKNOWN_VALUE,
  priceBasisNoun,
  priceUnitCaption,
  singlePriceBasis,
} from '@/lib/utils/catalogLabels';
import { FactoryLink } from './FactoryLink';
import { groupByLabel } from '@/lib/utils/catalogGroups';
import { formatJalali } from '@/lib/utils/jalali';
import { trackGoal } from '@/lib/analytics/track';
import { API_MODE } from '@/lib/api/config';
import { api } from '@/lib/api';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { MovementBadge, DeliveryBadge, Switch, Chip } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { Modal, PriceChart, KgQuantityModal } from '@/components/lazy';
import { ExportMenu } from './ExportMenu';
import { AlertBellButton } from '@/components/alerts/AlertBellButton';
import {
  HeartIcon,
  ChartIcon,
  PlusIcon,
  SortIcon,
  ChevronDownIcon,
} from '@/components/primitives/icons';
import styles from './PriceTable.module.css';

type SortKey = 'size' | 'price' | 'movement';

/** 0 = never ranked. Read as +Infinity, not literally 0, so one admin-ranked
 *  row (`order` 1, 2, …) always leads every untouched row in its section —
 *  not just the other ranked ones — instead of losing to them on a literal
 *  "0 < 1" comparison. */
const rank = (r: PriceRow): number => (r.order > 0 ? r.order : Infinity);

/** Shared row comparator — used for the per-factory sections, driven by the
 *  toolbar's `sort` control. */
function compareRows(a: PriceRow, b: PriceRow, sort: SortKey): number {
  if (sort === 'price') return a.current.price - b.current.price;
  if (sort === 'movement') return (b.current.movementPct ?? 0) - (a.current.movementPct ?? 0);
  // Admin-assigned `order` (owner request, 1405/06) takes priority over the
  // default «سایز» sort — it exists precisely because the plain size parse
  // below cannot express his arrangement (e.g. «۲ برش‌خورده» before «۲ رول»,
  // both sharing the same size string). Rows nobody has ranked tie with each
  // other here (both read as +Infinity) and fall straight through to the
  // untouched size comparator — a category the owner has never ranked
  // behaves exactly as it did before this field existed.
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  // `Number('۱۴')` is NaN — every stored size is in Persian digits, so this
  // comparator silently returned NaN for every pair and the «سایز» sort did
  // nothing at all.
  return Number(normalizeDigits(a.size ?? '0')) - Number(normalizeDigits(b.size ?? '0'));
}

/** Compare-modal row highlighting — true when the selected products don't all
 *  share this attribute, so the row that actually distinguishes them stands
 *  out instead of the buyer re-reading every cell to find it. */
function rowDiffers(values: ReadonlyArray<string | number | null>): boolean {
  return new Set(values).size > 1;
}

/** `rowDiffers(...)`, resolved straight to the CSS class (or `undefined`) a
 *  compare-table `<tr>` needs — every diff row below computed this ternary
 *  by hand, which is how a typo'd `styles.rowDiffers` on one of eight sites
 *  would have gone uncaught. */
function diffRowClass(values: ReadonlyArray<string | number | null>): string | undefined {
  return rowDiffers(values) ? styles.rowDiffers : undefined;
}

/**
 * The factory name, linked to that factory's own price page.
 *
 * The implementation moved to `components/catalog/FactoryLink` so the same
 * behaviour is available to every other surface that shows a mill name (the
 * homepage flyout, search, the /prices hub, SkuDetail, BulkQuote); this stays
 * as the table's local spelling of it, keeping the table's own `.nameLink`
 * styling. See FactoryLink for why `categorySlug` is the ROW's category.
 */
function FactoryCell({ categorySlug, factory }: { categorySlug: string; factory?: string | null }) {
  return (
    <FactoryLink
      categorySlug={categorySlug}
      factory={factory}
      className={styles.nameLink}
      prefetch={false}
    />
  );
}

type RowActions = {
  onToggleFav: (id: string) => void;
  onChart: (row: PriceRow) => void;
  onAddToCart: (row: PriceRow) => void;
};

/** US-02.9 — 2 to 4 rows only (a wider compare table stops being scannable). */
const MAX_COMPARE = 4;

/**
 * The shell around one price table.
 *
 * When the rows group into named sections (`labelled`) it is the collapsible
 * disclosure the owner asked for — «بر اساس کارخانه» for a category with real
 * mills, «بر اساس محل تولید» for the پروفیل subs whose mill names are
 * withheld — with a real `<h2>` per section for long-tail SEO, inside a native
 * `<details>` so it is keyboard-operable and ARIA-correct for free and so a
 * crawler still sees a collapsed section's full markup.
 *
 * Under `none` there is exactly one group and nothing to name it, so the
 * disclosure would be a heading-less accordion wrapping the entire page
 * content — an affordance that opens and closes the only thing on screen. It
 * degrades to a plain container instead: a پروفیل sub whose rows resolve to no
 * city at all gets one flat table, not a page-sized «نامشخص» section.
 */
function SectionShell({
  labelled,
  index,
  name,
  title,
  meta,
  open,
  children,
}: {
  labelled: boolean;
  index: number;
  name: string;
  title: string;
  meta: ReactNode;
  open: boolean;
  children: ReactNode;
}) {
  if (!labelled) return <div className={styles.factorySection}>{children}</div>;
  return (
    <details
      key={name}
      id={`factory-section-${index}`}
      className={styles.factorySection}
      open={open}
    >
      <summary className={styles.factorySummary}>
        <span className={styles.factorySummaryMain}>
          <ChevronDownIcon size={18} className={styles.factoryChevron} />
          <h2 className={styles.factoryTitle}>{title}</h2>
        </span>
        <span className={styles.factorySummaryMeta}>{meta}</span>
      </summary>
      {children}
    </details>
  );
}

/**
 * One price row — **one** DOM subtree, at every viewport.
 *
 * This used to be two components: a `<tr>` for desktop and a `<li>` card for
 * phones, BOTH rendered for every row with one of them hidden by
 * `display: none`. That doubled the markup, the hydration payload and the
 * interactive control count of the busiest page on the site — `/prices/rebar`
 * shipped ~2.0 MB of HTML, ~20.9k elements and ~1,989 buttons for ~248
 * products. The card component is gone; the table now *reflows* into that card
 * at narrow widths (see `@media (max-width: 767px)` in the stylesheet), so a
 * phone gets the same visual result out of half the nodes.
 *
 * How the reflow keeps its meaning:
 * - Every data cell carries `data-label`, and the narrow stylesheet prints it
 *   with `::before` — the `<th>` header text the cell loses when the table
 *   stops being laid out as a table. Zero extra elements.
 * - The price cell carries `data-unit` («تومان / کیلوگرم»), printed the same
 *   way, so a phone still sees what the number is denominated in even on a
 *   page whose rows all share one basis (where the column header carries it).
 * - A cell whose value is only a «نامشخص» placeholder gets `blankOnNarrow` and
 *   is dropped at card widths — the old card's rule that it omits a field
 *   rather than printing a placeholder, expressed in CSS instead of in a
 *   second component.
 * - ARIA roles are spelled out explicitly. `display: block`/`flex` on table
 *   elements strips their implicit table semantics in every browser; the old
 *   mobile card list had no table semantics at all, so restoring them by hand
 *   here is a net gain for screen readers, not a workaround.
 *
 * Memoized so toggling a favorite / opening the chart modal / anything else
 * that only affects one row doesn't re-render every other row too — `isFav`
 * and `vat` are plain primitives (not the parent's `fav` Set) and the
 * callbacks are stable (`useCallback` in the parent), so `React.memo`'s
 * default shallow comparison actually catches "nothing relevant to this row
 * changed".
 */
const PriceTableRow = memo(function PriceTableRow({
  row: r,
  vat,
  vatRate,
  isFav,
  compareChecked,
  onToggleCompare,
  onToggleFav,
  onChart,
  onAddToCart,
  showDimensions,
  dimensionsCol,
  attrCols,
  showFactory,
  factoryCol,
  showRegion,
  showRowBasis,
  sizeCol,
  weightCol,
}: {
  row: PriceRow;
  vat: boolean;
  vatRate: number;
  isFav: boolean;
  compareChecked: boolean;
  onToggleCompare: (id: string) => void;
  /** ورق or one of the three approved نبشی subs — must stay in
   *  lockstep with the matching `<th>`, which is driven by the same flag. */
  showDimensions: boolean;
  /** «ابعاد» for ورق; «ضخامت» for those نبشی rows. */
  dimensionsCol: string;
  /** «گرید»/«استاندارد»/«طول شاخه»/… — resolved once for the whole table from
   *  the page's category and the active sub-filter (see catalogLabels), and
   *  handed to the header and every row from that ONE array, so a cell can
   *  never drift out of alignment with the `<th>` above it. */
  attrCols: readonly AttrColumn[];
  /** Same lockstep rule for «کارخانه». False when no visible row carries a
   *  mill name — پروفیل, whose stored ones were fabricated and are suppressed
   *  at the DTO boundary (see catalogLabels.factoryIsMeaningful). */
  showFactory: boolean;
  /** What that column is CALLED here — «برند» on مانیسمان, «کارخانه»
   *  everywhere else. Passed down from the one `factoryLabel` call that built
   *  the `<th>`, so the reflowed card label and the header cannot drift into
   *  two different words for one column. */
  factoryCol: string;
  /** «محل تولید» — the producing city, in the same lockstep. On only when the
   *  rows carry one but there are no region SECTIONS to put it in the heading
   *  of, which is the flat-fallback case (see `showRegionColumn`). */
  showRegion: boolean;
  /** True only when the visible rows do NOT share one denomination, so the
   *  page-wide «قیمت‌ها … برای هر کیلوگرم است» note has been dropped and the
   *  basis has to ride along on each price cell. At card widths the basis is
   *  printed unconditionally from `data-unit` — a card has no column header to
   *  inherit it from. */
  showRowBasis: boolean;
  /** The «سایز»/«ضخامت»/… header text, so the reflowed cell can reprint it as
   *  its own label. Comes from the same `sizeLabel(categorySlug)` call that
   *  built the `<th>`. */
  sizeCol: string;
  /** «وزن شاخه»/«وزن» — same lockstep rule, from `weightLabel(categorySlug)`. */
  weightCol: string;
} & RowActions) {
  const hiddenLabel = priceHiddenLabel(r.current);
  return (
    <tr role="row" className={styles.row}>
      <td role="cell" className={styles.compareCell}>
        {/* The visible box stays native-sized; the label pads the tap target
            out to 44px so the checkbox meets the touch-target guideline
            without inflating a column meant to stay narrow. */}
        <label className={styles.compareCheckboxHit}>
          <input
            type="checkbox"
            checked={compareChecked}
            onChange={() => onToggleCompare(r.id)}
            aria-label={`افزودن ${r.name} به مقایسه`}
          />
        </label>
      </td>
      <th role="rowheader" scope="row" className={styles.name}>
        {/* Perf audit: a sub-category page renders one of these per row —
            up to ~186 on the largest today. Next.js Link prefetches its
            target the moment it enters the viewport, so a table this size
            fired that many background route-cache warms on a page a
            visitor almost always leaves via exactly ONE row. Measured
            contribution to this: 500ms Total Blocking Time on the same
            /prices/rebar/deformed page real users spend the most time on
            (Lighthouse, mobile, slow 4G, 1405/06/05). `prefetch={false}`
            does not change navigation — clicking still works exactly the
            same, it only removes the speculative background fetch. */}
        <Link
          href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
          className={styles.nameLink}
          prefetch={false}
        >
          {r.name}
        </Link>
      </th>
      {/* The size is the tail of the product name, so the card form drops this
          cell rather than printing «سایز: ۱۴» directly under «میلگرد ۱۴». */}
      <td role="cell" data-label={sizeCol} className={styles.sizeCell}>
        {r.size ? toPersianDigits(r.size) : 'نامشخص'}
      </td>
      {showDimensions ? (
        <td
          role="cell"
          data-label={dimensionsCol}
          className={`${styles.muted}${r.dimensions ? '' : ` ${styles.blankOnNarrow}`}`}
        >
          {r.dimensions ? toPersianDigits(r.dimensions) : 'نامشخص'}
        </td>
      ) : null}
      {attrCols.map((c) => (
        <td
          role="cell"
          key={c.key}
          data-label={c.label}
          // `card` is the column's own answer to "is there anything worth a
          // line here" — null both for an unfilled value and for a column that
          // is not a property of this row's sub-category at all.
          className={`${styles.muted}${c.card(r) === null ? ` ${styles.blankOnNarrow}` : ''}`}
        >
          {c.cell(r)}
        </td>
      ))}
      {showFactory ? (
        <td
          role="cell"
          data-label={factoryCol}
          className={`${styles.muted}${r.factory ? '' : ` ${styles.blankOnNarrow}`}`}
        >
          <FactoryCell categorySlug={r.categoryId} factory={r.factory} />
        </td>
      ) : null}
      {showRegion ? (
        <td
          role="cell"
          data-label={REGION_LABEL}
          className={`${styles.muted}${r.region ? '' : ` ${styles.blankOnNarrow}`}`}
        >
          {r.region ?? UNKNOWN_VALUE}
        </td>
      ) : null}
      <td
        role="cell"
        data-label={weightCol}
        className={`${styles.num}${r.theoreticalWeightKg ? '' : ` ${styles.blankOnNarrow}`}`}
      >
        {r.theoreticalWeightKg ? (
          <>
            {toPersianDigits(r.theoreticalWeightKg)} <bdi lang="en">kg</bdi>
          </>
        ) : (
          'نامشخص'
        )}
      </td>
      <td
        role="cell"
        className={`${styles.num} ${styles.price} ${styles.priceCell}`}
        data-unit={hiddenLabel ? undefined : priceUnitCaption(r.priceBasis, r.branchLengthM)}
      >
        {hiddenLabel ?? formatToman(withVat(r.current.price, vat, vatRate), false)}
        {showRowBasis && !r.current.priceHidden ? (
          <span className={styles.rowBasis}>
            {' / '}
            {priceBasisNoun(r.priceBasis, r.branchLengthM)}
          </span>
        ) : null}
      </td>
      <td role="cell" className={`${styles.num} ${styles.movementCell}`}>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
      </td>
      <td role="cell" data-label="به‌روزرسانی" className={styles.muted}>
        {formatJalali(r.current.updatedAt, 'MM/dd')}
      </td>
      <td role="cell" className={styles.deliveryCell}>
        <DeliveryBadge value={r.current.deliveryTime} />
      </td>
      <td role="cell" className={styles.actionsCell}>
        <div className={styles.actions}>
          <IconButton
            size="sm"
            label="افزودن به علاقه‌مندی"
            active={isFav}
            icon={<HeartIcon size={18} filled={isFav} />}
            onClick={() => onToggleFav(r.id)}
          />
          <AlertBellButton
            target={{ type: 'sku', skuId: r.id, label: r.name, currentValue: r.current.price }}
          />
          <IconButton
            size="sm"
            label="نمودار قیمت"
            icon={<ChartIcon size={18} />}
            onClick={() => onChart(r)}
          />
          <button
            className={styles.addBtn}
            onClick={() => onAddToCart(r)}
            disabled={r.current.priceHidden}
            title={r.current.priceHidden ? 'برای این کالا باید تماس بگیرید.' : undefined}
          >
            <PlusIcon size={16} /> <span className={styles.addBtnLabel}>سبد</span>
          </button>
        </div>
      </td>
    </tr>
  );
});

/**
 * E1 · The Datasheet — the signature price table, organised as
 * **«بر اساس کارخانه»**: one `<details>` section per factory, each with its
 * own heading and full size table, matching the structure the owner asked
 * for (mirrors ahanprice.com's per-factory pages) — real, crawlable headings
 * for long-tail SEO ("قیمت میلگرد کویر کاشان"), collapsed by default past
 * the first few so the page doesn't become an unscannable wall of tables.
 * `<details>`/`<summary>` (not a hand-rolled accordion) so this is
 * keyboard-operable and ARIA-correct for free, AND so every section's full
 * content is in the server-rendered HTML regardless of open/closed state —
 * collapsing is a pure CSS/browser affordance, nothing is conditionally
 * unmounted, so a crawler sees everything a human would after clicking
 * "expand all".
 *
 * A quick-jump chip row (something neither ahanprice nor our old flat table
 * had) lets a visitor who already knows their factory skip straight to its
 * section instead of scrolling past everyone else's.
 *
 * A «مقایسهٔ سریع بر اساس سایز» panel used to sit above these sections —
 * removed on the owner's instruction (1405/05); the per-size, cross-factory
 * comparison a buyer wants now lives in `BulkQuote`'s «مقایسهٔ کارخانه‌ها»
 * further down the same page, which does it on a real tonnage and
 * destination city rather than on unit price alone.
 *
 * The compare-checkbox feature (US-02.9) spans every factory section at
 * once — `compareIds` is just a Set of SKU ids, independent of which
 * section a checkbox lives in.
 */
export function PriceTable({
  rows,
  subs,
  categoryName,
  sub: subProp,
  onSubChange,
  initialSub = null,
  categorySlug,
  vatRate = CONSTANTS.VAT_RATE,
  factoryOrder,
}: {
  rows: PriceRow[];
  subs: SubCat[];
  categoryName: string;
  /** Slug of the category this table is rendered for. Only used to label the
   *  `size` column — ورق measures thickness, not size (see catalogLabels).
   *  Taken from the page's own category rather than a row's, so a page that
   *  mixes categories (the «استیل» hub, via cross-listing) keeps the generic
   *  label instead of inheriting whichever row happens to be first. */
  categorySlug?: string;
  /** Controlled active sub-category slug (or null = همه). When provided with
   *  `onSubChange`, the toolbar filter is driven by the parent and stays in
   *  sync with the sub-group selection band. */
  sub?: string | null;
  onSubChange?: (sub: string | null) => void;
  /** Initial sub for the uncontrolled case (e.g. deep-link landing). */
  initialSub?: string | null;
  /** Live admin-configured VAT rate (`settings.VAT_RATE`) — the «با احتساب
   *  ارزش افزوده» toggle used to always apply the static `CONSTANTS.VAT_RATE`
   *  default. Falls back to the same default only for callers that don't
   *  have it yet. */
  vatRate?: number;
  /** The admin's chosen order for this category's «بر اساس کارخانه» sections,
   *  best-first (US-18.2, `factory_order`). Partial and optional by design:
   *  only the names listed here are placed, everything else keeps the
   *  cheapest-visible-price order it had before. Empty or absent → the page
   *  behaves exactly as it did before this existed. */
  factoryOrder?: string[];
}) {
  const sizeCol = sizeLabel(categorySlug);
  const weightCol = weightLabel(categorySlug);
  const subGroups = useMemo(() => groupByLabel(subs), [subs]);
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [vat, setVat] = useState(false);
  // Per-factory overrides of the page-wide `vat`, keyed by factory name; a key
  // that isn't present means "this section follows the toolbar". A sparse map
  // rather than one independent boolean per section because the common case is
  // that NOTHING is overridden — a visitor who flips the toolbar switch expects
  // all nine mills to move, and a seeded-per-section model would leave every
  // already-mounted section behind.
  const [vatOverrides, setVatOverrides] = useState<Record<string, boolean>>({});
  const vatFor = (factory: string) => vatOverrides[factory] ?? vat;
  // The toolbar switch is a page-wide instruction, so it wipes the overrides
  // instead of losing to them. Without this, a section toggled ten minutes ago
  // would silently keep disagreeing with the switch the visitor just flipped,
  // with nothing on screen to explain why.
  const setGlobalVat = useCallback((next: boolean) => {
    setVat(next);
    setVatOverrides({});
  }, []);
  const setFactoryVat = useCallback(
    (factory: string, next: boolean) => {
      setVatOverrides((prev) => {
        // Toggled back to whatever the toolbar says → drop the override rather
        // than pin the same value, so the next global flip picks this section
        // up again along with everyone else.
        if (next === vat) {
          if (!(factory in prev)) return prev;
          const rest = { ...prev };
          delete rest[factory];
          return rest;
        }
        if (prev[factory] === next) return prev;
        return { ...prev, [factory]: next };
      });
    },
    [vat],
  );
  const [sort, setSort] = useState<SortKey>('size');
  const [internalSub, setInternalSub] = useState<string | null>(initialSub);
  const controlled = onSubChange !== undefined;
  const sub = controlled ? (subProp ?? null) : internalSub;
  // ورق keeps its category-wide «ابعاد» column. نبشی thickness is
  // intentionally sub-aware: only the three owner-approved subs show it, and
  // the mixed `angle-channel` «همه» view stays structurally unchanged.
  const showDimensions = usesDimensions(categorySlug, sub);
  const dimensionsCol = dimensionsLabel(categorySlug, sub);
  // The «گرید»/«استاندارد»/«طول شاخه»/«طول سفارشی»/«آلیاژ» columns also
  // depend on the ACTIVE sub-filter, so they are computed after `sub` is
  // resolved: تیرآهن's «استاندارد» and پروفیل's per-sub replacements
  // are both sub-level decisions, while the mixed «همه» view falls back to
  // the category default (see catalogLabels).
  //
  // Memoized because it is handed to every memoized row/card: a fresh array
  // each render would defeat their `React.memo` entirely.
  const attrCols = useMemo(() => attributeColumns(categorySlug, sub), [categorySlug, sub]);
  // «کارخانه», or «برند» on مانیسمان — one stored column, named for what it
  // actually holds in this context (see catalogLabels' factoryLabel). Like
  // `attrCols` it depends on the ACTIVE sub-filter, so the mixed «همه» view
  // keeps the generic «کارخانه»: those rows do not agree on a sub, and a
  // گازی row under a «برند» header would be a false claim about its mill.
  const factoryCol = factoryLabel(categorySlug, sub);
  /**
   * What the sections below are sections OF — «تیرآهن», or «تیرآهن هاش سبک»
   * on the تیرآهن sub-types whose heading used to misdescribe them (see
   * catalogLabels' sectionSubject).
   *
   * Resolved from the ACTIVE sub-filter, not from whatever sub the page was
   * entered on: this table's filter is uncontrolled on a sub page
   * (`initialSub`), so a visitor can switch to «همه» without navigating, and
   * the heading has to stop claiming هاش the moment the rows stop being only
   * هاش. `subs` is looked up rather than trusted to contain the slug — an
   * unknown one falls back to the plain category name.
   */
  const activeSub = useMemo(
    () => (sub ? (subs.find((x) => x.slug === sub) ?? null) : null),
    [subs, sub],
  );
  const subject = sectionSubject(categoryName, categorySlug, activeSub);

  // Filter changes animate via same-document View Transitions where supported
  // (a no-op elsewhere) — the rows crossfade instead of snapping.
  const withTransition = (apply: () => void) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (
        document as Document & { startViewTransition: (cb: () => void) => void }
      ).startViewTransition(() => flushSync(apply));
    } else {
      apply();
    }
  };
  const setSub = (next: string | null) => {
    withTransition(() => {
      if (controlled) onSubChange?.(next);
      else setInternalSub(next);
    });
  };
  const [fav, setFav] = useState<Set<string>>(new Set());
  // Mirrors `fav` so `toggleFav` (below) can read the latest value without
  // depending on it — keeping `toggleFav`'s identity stable across renders
  // that don't touch favorites (sort/VAT/filter/chart) so the memoized row
  // components don't all re-render on every parent state change.
  const favRef = useRef(fav);
  favRef.current = fav;
  // Live mode: hydrate stars from the server once per mount (signed-in only).
  useEffect(() => {
    if (API_MODE !== 'live' || !isAuthenticated) return;
    let cancelled = false;
    fetch('/api/me/favorites')
      .then((r) => (r.ok ? (r.json() as Promise<{ favorites?: { id: string }[] }>) : null))
      .then((data) => {
        if (!cancelled && data?.favorites) setFav(new Set(data.favorites.map((f) => f.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
  const [chartFor, setChartFor] = useState<PriceRow | null>(null);
  // Real price history (live: DB-backed; mock: the deterministic generator) —
  // fetched on demand only while the modal is open, not the mock series
  // unconditionally (which previously ran even in live mode).
  const { data: chartHistory } = useQuery({
    queryKey: ['sku-history', chartFor?.slug],
    queryFn: () => api.catalog.history(chartFor!.slug, chartFor!.current.price),
    enabled: chartFor !== null,
    staleTime: 5 * 60 * 1000,
  });
  const chartSeries = (chartHistory?.points ?? []).map((p) => p.price);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Only the SUB-CATEGORY (ساده/آجدار/…) narrows the row set — «کارخانه» and
  // «سایز» used to be independent dropdown filters on one flat list; the
  // by-factory sections below now carry that structure, so nothing here
  // hides rows from anything else.
  const subFiltered = useMemo(
    () => rows.filter((r) => !sub || r.subCategoryId === sub),
    [rows, sub],
  );

  /**
   * What the rows on screen actually group BY — mill, producing city, or
   * nothing (see catalogLabels.groupModeFor).
   *
   * Data-driven rather than a category/sub allow-list, so it needs no second
   * opinion about which products have mills: `catalogRepo.toPriceRow` already
   * withholds the fabricated پروفیل factory names and puts the city recovered
   * from them in `region` instead, and this simply notices which of the two is
   * present. `factory` is the long-standing behaviour and is what every
   * category other than those پروفیل subs still gets, byte for byte.
   */
  const groupMode = useMemo(() => groupModeFor(subFiltered), [subFiltered]);
  /** «کارخانه» — the column, the compare row, the section count. Off exactly
   *  when no visible row carries a mill name. */
  const showFactory = groupMode === 'factory';
  /** What one section is a section OF, for the labels below. Null under
   *  `none`: there are no sections, and naming a structure the page does not
   *  have is worse than saying nothing about it. */
  const sectionNoun =
    groupMode === 'factory' ? factoryCol : groupMode === 'region' ? REGION_LABEL : null;
  /**
   * «محل تولید» as a COLUMN rather than as section headings.
   *
   * Only in the flat-fallback case: too few rows resolved to a city to justify
   * sectioning the page by one, but the ones that did still know where they
   * come from, and dropping the fact entirely would lose real information for
   * no reason. Under `region` the headings already say it and a column would
   * repeat every heading on every row; under `factory` the rows have no region
   * at all — the DTO publishes one or the other, never both.
   */
  const showRegionColumn = groupMode === 'none' && subFiltered.some((r) => r.region);
  const sortLabel = sectionNoun ? `مرتب‌سازی بخش‌های ${sectionNoun}` : 'مرتب‌سازی جدول قیمت';

  /** Admin-placed factories, name → position. Built once per prop change so
   *  the comparator below stays an O(1) lookup. */
  const factoryRank = useMemo(
    () => new Map((factoryOrder ?? []).map((f, i) => [f, i] as const)),
    [factoryOrder],
  );

  // The page's sections — «بر اساس کارخانه», or «بر اساس محل تولید» on the
  // پروفیل subs — grouped from the same sub-filtered rows, each group
  // internally sorted by the toolbar's `sort` control (size by default, same
  // comparator the old flat table used).
  const bySection = useMemo(() => {
    const map = new Map<string, PriceRow[]>();
    for (const r of subFiltered) {
      const key = groupKeyFor(groupMode, r);
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    for (const list of map.values()) list.sort((a, b) => compareRows(a, b, sort));
    return [...map.entries()].sort(([an, a], [bn, b]) => {
      // «نامشخص» always sinks to the bottom of a region-grouped page: a named
      // city is information and the absence of one is not, so it cannot lead
      // the page just because it happens to hold the cheapest row. Deliberately
      // NOT applied to factory mode's «سایر», which has ranked by price among
      // the unplaced mills since US-18.2 and is asserted to (factoryOrder test).
      if (groupMode === 'region') {
        const ac = an === UNKNOWN_VALUE;
        const bc = bn === UNKNOWN_VALUE;
        if (ac !== bc) return ac ? 1 : -1;
      }
      // The admin's order wins wherever it has an opinion (US-18.2): the mills
      // customers ask for by name are not the cheapest ones, and leading with
      // «whoever is cheapest today» reshuffled the page daily and buried
      // ذوب‌آهن under mills nobody had heard of. It is a FACTORY order — it has
      // no opinion about cities, and `factoryRank` is simply empty of them.
      const ar = factoryRank.get(an) ?? Infinity;
      const br = factoryRank.get(bn) ?? Infinity;
      if (ar !== br) return ar - br;
      // Both unplaced (or the admin has arranged nothing at all): cheapest
      // overall visible price first — the previous behaviour, kept verbatim
      // so a partly-filled order is never worse than no order.
      const av = a.find((r) => !r.current.priceHidden)?.current.price ?? Infinity;
      const bv = b.find((r) => !r.current.priceHidden)?.current.price ?? Infinity;
      return av - bv;
    });
  }, [subFiltered, sort, factoryRank, groupMode]);
  const sectionIndex = useMemo(
    () => new Map(bySection.map(([name], i) => [name, i] as const)),
    [bySection],
  );
  /** First 3 sections start expanded; the rest start collapsed. Purely a
   *  visual default via `<details open>` — every section's full markup is
   *  always in the DOM regardless (see the component docstring). */
  const DEFAULT_OPEN_COUNT = 3;

  // «?factory=…» deep link (e.g. the home hero board's PriceTable link):
  // scroll to and expand that factory's section instead of the old
  // filter-dropdown pre-selection. `fromUrl` only ever does anything if it
  // exactly matches a real factory name already present in `rows` — an
  // unrecognised value is silently ignored, never interpolated into a
  // selector or used to build an id string.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('factory');
    if (!fromUrl) return;
    const idx = sectionIndex.get(fromUrl);
    if (idx === undefined) return;
    const el = document.getElementById(`factory-section-${idx}`);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIndex]);

  const jumpToSection = (name: string) => {
    const idx = sectionIndex.get(name);
    if (idx === undefined) return;
    const el = document.getElementById(`factory-section-${idx}`);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggleFav = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        toast.info('برای ذخیرهٔ علاقه‌مندی‌ها وارد شوید.', {
          label: 'ورود',
          href: routes.login(routes.category(rows[0]?.categoryId ?? '')),
        });
        return;
      }
      const adding = !favRef.current.has(id);
      setFav((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      // Live mode: persist (optimistic — a failure just reverts the star).
      if (API_MODE === 'live') {
        const req = adding
          ? fetch('/api/me/favorites', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ skuId: id }),
            })
          : fetch(`/api/me/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' });
        req.catch(() => {
          setFav((prev) => {
            const next = new Set(prev);
            if (adding) next.delete(id);
            else next.add(id);
            return next;
          });
        });
      }
    },
    [isAuthenticated, rows, toast],
  );

  const addRowToCart = useCallback(
    (r: PriceRow, qty: number) => {
      add({
        skuId: r.id,
        name: r.name,
        qty,
        unit: r.unit,
        unitPrice: r.current.price,
        weightKg: r.theoreticalWeightKg,
      });
      trackGoal('add-to-cart', r.categoryId, r.name);
      toast.success(`${r.name} به سبد استعلام اضافه شد.`, {
        label: 'مشاهده سبد',
        href: routes.cart(),
      });
    },
    [add, toast],
  );

  // «۱ کیلوگرم میلگرد» is not a purchasable unit (audit finding) — a kg-basis
  // row asks how much (KgQuantityModal) instead of defaulting straight to
  // qty:1. Every other basis already counts in a real unit (شاخه/برگ/عدد/…),
  // so 1 there stays correct as-is.
  const [kgQtyRow, setKgQtyRow] = useState<PriceRow | null>(null);
  const addToCart = useCallback(
    (r: PriceRow) => {
      if (r.priceBasis === 'kg') {
        setKgQtyRow(r);
        return;
      }
      addRowToCart(r, 1);
    },
    [addRowToCart],
  );

  const updated = rows[0]?.current.updatedAt;
  // `subFiltered`, not `rows`: the note sits under the sub-category filter and
  // describes what is actually on screen.
  const priceBasis = useMemo(() => singlePriceBasis(subFiltered), [subFiltered]);
  const selectedForCompare = useMemo(
    () => rows.filter((r) => compareIds.has(r.id)),
    [rows, compareIds],
  );
  // The compare modal's next action: only offered when a cheaper priced
  // option actually exists among the selection — a hidden price can't be
  // compared, and if every visible price ties there is nothing "cheaper" to
  // push the visitor toward.
  const cheapestForCompare = useMemo(() => {
    const priced = selectedForCompare.filter((r) => !r.current.priceHidden);
    if (priced.length < 2) return null;
    const cheapest = priced.reduce((a, b) => (b.current.price < a.current.price ? b : a));
    const isActuallyCheaper = priced.some(
      (r) => r.id !== cheapest.id && r.current.price > cheapest.current.price,
    );
    return isActuallyCheaper ? cheapest : null;
  }, [selectedForCompare]);
  const exportRows = useMemo(() => bySection.flatMap(([, list]) => list), [bySection]);

  return (
    <div className={styles.wrap}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.subs}>
          <Chip variant="filter" selected={sub === null} onClick={() => setSub(null)}>
            همه
          </Chip>
          {/* Sub-categories sharing a `groupLabel` cluster under one heading —
              same treatment the mega-menu, mobile drawer, home stage and admin
              taxonomy rail already give them (lib/utils/catalogGroups.ts). This
              filter bar was the last place that still rendered the flat list,
              so «لوله مانیسمان داخلی»/«لوله مانیسمان خارجی» showed up as two
              unrelated chips instead of one «مانیسمان» group with two options.
              A sub with a null groupLabel is its own singleton cluster and is
              rendered as a bare chip — byte-identical to before — so the many
              ungrouped sub-categories are untouched. */}
          {subGroups.map((group) =>
            group.label ? (
              <div
                key={`g_${group.label}`}
                className={styles.subGroup}
                role="group"
                aria-label={group.label}
              >
                <span className={styles.subGroupHeading}>{group.label}</span>
                <div className={styles.subGroupChips}>
                  {group.items.map((s) => (
                    <Chip
                      key={s.slug}
                      variant="filter"
                      selected={sub === s.slug}
                      onClick={() => setSub(sub === s.slug ? null : s.slug)}
                    >
                      {s.name}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : (
              group.items.map((s) => (
                <Chip
                  key={s.slug}
                  variant="filter"
                  selected={sub === s.slug}
                  onClick={() => setSub(sub === s.slug ? null : s.slug)}
                >
                  {s.name}
                </Chip>
              ))
            ),
          )}
        </div>
        <div className={styles.tools}>
          <label className={styles.sort}>
            <SortIcon size={16} />
            <span className="visually-hidden">{sortLabel}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={styles.select}
              aria-label={sortLabel}
            >
              <option value="size">{sizeCol}</option>
              <option value="price">قیمت</option>
              <option value="movement">نوسان</option>
            </select>
          </label>
          <Switch checked={vat} onChange={setGlobalVat} label="با ارزش‌افزوده" />
          {/* The switch's own label is static text regardless of on/off state
              — this restates the CURRENT state next to it, the same pattern
              SkuDetail.tsx already used, so a visitor who toggles, scrolls,
              and comes back has a text cue, not just the switch's visual
              state, for a change that swings every price by vatRate (audit
              finding, 2026-08-26). */}
          <span className={styles.vatNote}>
            {vat
              ? `شامل ${toPersianDigits(vatRate * 100)}٪ مالیات بر ارزش‌افزوده`
              : 'بدون ارزش‌افزوده'}
          </span>
          {/* Page-wide export — every factory at once, in the page-wide VAT
              state. A section a visitor has individually overridden is NOT
              re-resolved here: this file is the "everything" export and its
              subtitle line spells out which of the two numbers it carries, so
              a recipient can never be misled. The per-section export below
              follows that section's own toggle. */}
          {/* `subject`, not `categoryName`: `exportRows` is built from
              `bySection`, which is already narrowed by the active sub-filter,
              so on a هاش page this "everything" export contains only هاش rows
              — and titling the sheet, its header line and its filename
              «تیرآهن» mislabels a file that outlives the page it came from. */}
          <ExportMenu
            rows={exportRows}
            title={subject}
            categorySlug={categorySlug}
            subCategorySlug={sub}
            vat={vat}
            vatRate={vatRate}
          />
          <button
            type="button"
            className={styles.compareLink}
            disabled={selectedForCompare.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            مقایسه{' '}
            {selectedForCompare.length > 0 ? `(${toPersianDigits(selectedForCompare.length)})` : ''}
          </button>
        </div>
      </div>

      {/* The compare button just goes disabled with one item checked, which
          audits and support tickets both read as "broken" rather than
          "needs one more". Spell out why. `role="status"` so a screen
          reader announces it the moment the second checkbox click is still
          missing, not just on page load. */}
      {selectedForCompare.length === 1 ? (
        <p className={styles.compareHint} role="status">
          حداقل دو محصول برای مقایسه انتخاب کنید — یک مورد دیگر را هم علامت بزنید.
        </p>
      ) : null}

      <div className={styles.meta}>
        <span>
          {toPersianDigits(subFiltered.length)} کالا
          {sectionNoun ? ` · ${toPersianDigits(bySection.length)} ${sectionNoun}` : ''}
          {updated ? ` · به‌روزرسانی ${formatJalali(updated)}` : ''}
        </span>
        {/* Only when every visible row shares one denomination. A table mixing
            kg-priced and عدد-priced products (میلگرد + کوپلر) would otherwise
            print a blanket «برای هر کیلوگرم» that is wrong for some of its
            own rows; there, each row's own caption carries it instead. */}
        {priceBasis ? (
          <span className={styles.note}>
            {`قیمت‌ها به تومان و برای هر ${priceBasisNoun(priceBasis.basis, priceBasis.branchLengthM)} است.`}
          </span>
        ) : null}
      </div>

      {/* ===== پرش سریع به بخش‌ها ===== */}
      {sectionNoun && bySection.length > 1 && (
        <nav className={styles.quickJump} aria-label={`پرش به ${sectionNoun}`}>
          {bySection.map(([name]) => (
            <button
              key={name}
              type="button"
              className={styles.quickJumpChip}
              onClick={() => jumpToSection(name)}
            >
              {name}
            </button>
          ))}
        </nav>
      )}

      {/* ===== one section per کارخانه / محل تولید ===== */}
      <div className={styles.factoryList}>
        {bySection.map(([name, list], i) => {
          const cheapest = list.find((r) => !r.current.priceHidden);
          const factoryVat = vatFor(name);
          // «قیمت میلگرد کویر کاشان» when the mill is a real distinction,
          // «قیمت پروفیل Z تهران» when the producing city is, and «قیمت پروفیل
          // مبلی» when neither is and this is the page's one table.
          //
          // `subject` — not the bare category name — because on تیرآهن's
          // هاش/لانه‌زنبوری subs the category word alone advertised plain
          // تیرآهن above rows that are nothing of the kind. It resolves back
          // to the category name for every other category and for the mixed
          // «همه» view, so this line is byte-for-byte what it was everywhere
          // else.
          const sectionTitle = sectionNoun ? `${subject} ${name}` : subject;
          return (
            <SectionShell
              key={name}
              labelled={sectionNoun !== null}
              index={i}
              name={name}
              title={`قیمت ${sectionTitle}`}
              open={i < DEFAULT_OPEN_COUNT}
              meta={
                <>
                  {toPersianDigits(list.length)} {sizeCol}
                  {cheapest ? (
                    <>
                      {' '}
                      · از{' '}
                      {formatToman(
                        withVat(cheapest.current.price, factoryVat, vatRate),
                        false,
                      )}{' '}
                      تومان
                    </>
                  ) : null}
                </>
              }
            >
              <div className={styles.factoryBody}>
                {/* Per-factory controls — the toolbar's VAT toggle and export
                    menu, scoped to this mill only, the way ahanprice.com scopes
                    theirs by giving each mill its own page. They live in
                    `factoryBody`, NOT in `<summary>`: a control inside the
                    summary would swallow clicks the native <details> toggle
                    needs, and would land in the tab order between the
                    disclosure and its own content.

                    Suppressed when there is only one factory — the page-wide
                    toolbar already covers exactly these rows, and a second
                    identical pair of controls three lines below the first is
                    noise. Same rule the quick-jump nav above follows. */}
                {bySection.length > 1 ? (
                  <div className={styles.factoryTools}>
                    <Switch
                      size="sm"
                      checked={factoryVat}
                      onChange={(next) => setFactoryVat(name, next)}
                      label="با ارزش‌افزوده"
                      ariaLabel={`با ارزش‌افزوده — ${name}`}
                    />
                    {/* Same state-restating note as the page-wide toggle above
                        — doubly needed here, since a section's own override
                        can silently disagree with the page-wide toggle's
                        state (audit finding, 2026-08-26). */}
                    <span className={styles.vatNote}>
                      {factoryVat ? `شامل ${toPersianDigits(vatRate * 100)}٪` : 'بدون ارزش‌افزوده'}
                    </span>
                    <ExportMenu
                      rows={list}
                      title={sectionTitle}
                      categorySlug={categorySlug}
                      subCategorySlug={sub}
                      vat={factoryVat}
                      vatRate={vatRate}
                      compact
                      scopeLabel={name}
                    />
                  </div>
                ) : null}

                {/* The one price table. Reflows into a card list at ≤767px —
                    see PriceTableRow for why there is no second markup. */}
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label={`قیمت ${sectionTitle}`}
                  tabIndex={0}
                >
                  {/* eslint-disable jsx-a11y/no-redundant-roles -- NOT redundant here:
                      at ≤767px this table reflows into cards, and `display: block`
                      /`flex` on a table element drops its implicit table role in
                      every browser. Spelling the roles out keeps the reflowed card
                      list a real table for assistive tech — which the `<ul>` of
                      cards it replaced never was. */}
                  <table role="table" className={`${styles.table} tnum`}>
                    <caption className="visually-hidden">قیمت {sectionTitle}</caption>
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          <span className="visually-hidden">مقایسه</span>
                        </th>
                        <th role="columnheader" scope="col">
                          محصول
                        </th>
                        <th
                          role="columnheader"
                          scope="col"
                          aria-sort={sort === 'size' ? 'ascending' : 'none'}
                        >
                          {sizeCol}
                        </th>
                        {/* The shared secondary-spec column is deliberately
                            not sortable. ورق stores a width×length pair here;
                            نبشی stores free-form wall thickness. Neither has
                            an ordering this table's comparator can honour. */}
                        {showDimensions ? (
                          <th role="columnheader" scope="col">
                            {dimensionsCol}
                          </th>
                        ) : null}
                        {attrCols.map((c) => (
                          <th role="columnheader" key={c.key} scope="col">
                            {c.label}
                          </th>
                        ))}
                        {showFactory ? (
                          <th role="columnheader" scope="col">
                            {factoryCol}
                          </th>
                        ) : null}
                        {showRegionColumn ? (
                          <th role="columnheader" scope="col">
                            {REGION_LABEL}
                          </th>
                        ) : null}
                        <th role="columnheader" scope="col" className={styles.num}>
                          {weightCol}
                        </th>
                        <th
                          role="columnheader"
                          scope="col"
                          className={styles.num}
                          aria-sort={sort === 'price' ? 'ascending' : 'none'}
                        >
                          قیمت (تومان)
                        </th>
                        <th
                          role="columnheader"
                          scope="col"
                          className={styles.num}
                          aria-sort={sort === 'movement' ? 'descending' : 'none'}
                        >
                          نوسان
                        </th>
                        <th role="columnheader" scope="col">
                          تاریخ
                        </th>
                        <th role="columnheader" scope="col">
                          تحویل
                        </th>
                        <th role="columnheader" scope="col" className={styles.actionsCol}>
                          عملیات
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {list.map((r) => (
                        <PriceTableRow
                          key={r.id}
                          row={r}
                          vat={factoryVat}
                          vatRate={vatRate}
                          isFav={fav.has(r.id)}
                          compareChecked={compareIds.has(r.id)}
                          onToggleCompare={toggleCompare}
                          showDimensions={showDimensions}
                          dimensionsCol={dimensionsCol}
                          attrCols={attrCols}
                          showFactory={showFactory}
                          factoryCol={factoryCol}
                          showRegion={showRegionColumn}
                          showRowBasis={priceBasis === null}
                          sizeCol={sizeCol}
                          weightCol={weightCol}
                          onToggleFav={toggleFav}
                          onChart={setChartFor}
                          onAddToCart={addToCart}
                        />
                      ))}
                    </tbody>
                  </table>
                  {/* eslint-enable jsx-a11y/no-redundant-roles */}
                </div>
              </div>
            </SectionShell>
          );
        })}
      </div>

      {/* Price history modal */}
      <Modal
        open={chartFor !== null}
        onClose={() => setChartFor(null)}
        title={chartFor ? `نمودار قیمت ${chartFor.name}` : 'نمودار قیمت'}
        footer={
          chartFor ? (
            <button
              className={styles.modalCta}
              onClick={() => {
                router.push(routes.sku(chartFor.categoryId, chartFor.subCategoryId, chartFor.slug));
                setChartFor(null);
              }}
            >
              مشاهدهٔ صفحهٔ محصول
            </button>
          ) : undefined
        }
      >
        {chartFor ? (
          chartSeries.length >= 2 ? (
            <PriceChart series={chartSeries} />
          ) : (
            <p className={styles.muted}>در حال بارگذاری نمودار…</p>
          )
        ) : null}
      </Modal>

      {/* Side-by-side comparison (US-02.9) — 2 to 4 rows, spanning every
          factory section at once since `compareIds` is just a Set of ids,
          independent of which section a checkbox lives in.

          Prices here use the page-wide `vat`, not any section's override, for
          the same reason the page-wide export does: the whole point of this
          table is comparing mills to each other, and per-section VAT states
          would put two of its columns on different bases with nothing in the
          row header to say so. */}
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="مقایسهٔ کالاها"
        footer={
          cheapestForCompare ? (
            <button
              type="button"
              className={styles.modalCta}
              onClick={() => {
                addToCart(cheapestForCompare);
                setCompareOpen(false);
              }}
            >
              {/* A kg-basis row (rebar — the dominant case) can't be added
                  with a single click: addToCart() defers to KgQuantityModal
                  to ask how much. The old label promised "به سبد" (added to
                  cart) unconditionally, so a kg-basis pick looked like the
                  button silently failed when a *different*, seemingly
                  unrelated modal opened instead (audit finding, 2026-08-26).
                  Say what's actually about to happen. */}
              {cheapestForCompare.priceBasis === 'kg'
                ? `انتخاب مقدار برای گزینهٔ ارزان‌تر (${cheapestForCompare.name})`
                : `افزودن گزینهٔ ارزان‌تر (${cheapestForCompare.name}) به سبد`}
            </button>
          ) : undefined
        }
      >
        {selectedForCompare.length < 2 ? null : (
          <div className={styles.compareScroll}>
            <table className={`${styles.compareTable} tnum`}>
              <caption className="visually-hidden">
                مقایسهٔ مشخصات و قیمت کالاهای انتخاب‌شده؛ ردیف‌هایی که کالاها در آن‌ها متفاوت‌اند
                برجسته شده‌اند.
              </caption>
              <tbody>
                <tr>
                  <th scope="row">محصول</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>
                      <Link
                        href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                        onClick={() => setCompareOpen(false)}
                      >
                        {r.name}
                      </Link>
                    </td>
                  ))}
                </tr>
                <tr className={diffRowClass(selectedForCompare.map((r) => r.size ?? null))}>
                  <th scope="row">{sizeCol}</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>{r.size ? toPersianDigits(r.size) : 'نامشخص'}</td>
                  ))}
                </tr>
                {/* ورق dimensions or the approved نبشی wall thickness,
                    kept in the comparison wherever it is on the source table. */}
                {showDimensions ? (
                  <tr className={diffRowClass(selectedForCompare.map((r) => r.dimensions ?? null))}>
                    <th scope="row">{dimensionsCol}</th>
                    {selectedForCompare.map((r) => (
                      <td key={r.id}>{r.dimensions ? toPersianDigits(r.dimensions) : 'نامشخص'}</td>
                    ))}
                  </tr>
                ) : null}
                {/* Only when at least one selected product HAS a mill — a
                    «کارخانه: نامشخص» row across a پروفیل comparison would
                    reintroduce, in the one place a buyer studies most closely,
                    exactly the fabricated distinction this page dropped. */}
                {selectedForCompare.some((r) => r.factory) ? (
                  <tr className={diffRowClass(selectedForCompare.map((r) => r.factory ?? null))}>
                    <th scope="row">{factoryCol}</th>
                    {selectedForCompare.map((r) => (
                      <td key={r.id}>{r.factory ?? 'نامشخص'}</td>
                    ))}
                  </tr>
                ) : selectedForCompare.some((r) => r.region) ? (
                  <tr className={diffRowClass(selectedForCompare.map((r) => r.region ?? null))}>
                    <th scope="row">{REGION_LABEL}</th>
                    {selectedForCompare.map((r) => (
                      <td key={r.id}>{r.region ?? UNKNOWN_VALUE}</td>
                    ))}
                  </tr>
                ) : null}
                <tr
                  className={diffRowClass(
                    selectedForCompare.map((r) => r.theoreticalWeightKg ?? null),
                  )}
                >
                  <th scope="row">{weightCol}</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>
                      {r.theoreticalWeightKg
                        ? `${toPersianDigits(r.theoreticalWeightKg)} kg`
                        : 'نامشخص'}
                    </td>
                  ))}
                </tr>
                <tr
                  className={diffRowClass(
                    selectedForCompare.map(
                      (r) => priceHiddenLabel(r.current) ?? withVat(r.current.price, vat, vatRate),
                    ),
                  )}
                >
                  <th scope="row">قیمت (تومان)</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id} className={styles.price}>
                      {priceHiddenLabel(r.current) ??
                        formatToman(withVat(r.current.price, vat, vatRate), false)}
                    </td>
                  ))}
                </tr>
                <tr
                  className={diffRowClass(
                    selectedForCompare.map(
                      (r) => `${r.current.movementDir}:${r.current.movementPct ?? ''}`,
                    ),
                  )}
                >
                  <th scope="row">نوسان</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>
                      <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
                    </td>
                  ))}
                </tr>
                <tr
                  className={diffRowClass(
                    selectedForCompare.map((r) => r.current.deliveryTime ?? null),
                  )}
                >
                  <th scope="row">تحویل</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>
                      <DeliveryBadge value={r.current.deliveryTime} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <KgQuantityModal
        open={kgQtyRow !== null}
        onClose={() => setKgQtyRow(null)}
        productName={kgQtyRow?.name ?? ''}
        branchWeightKg={kgQtyRow?.theoreticalWeightKg}
        unitPrice={kgQtyRow?.current.price}
        onConfirm={(qtyKg) => {
          if (kgQtyRow) addRowToCart(kgQtyRow, qtyKg);
          setKgQtyRow(null);
        }}
      />
    </div>
  );
}
