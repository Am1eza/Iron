'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { formatToman, priceHiddenLabel, toPersianDigits, normalizeDigits } from '@/lib/utils/format';
import { sizeLabel, usesDimensions, DIMENSIONS_LABEL } from '@/lib/utils/catalogLabels';
import { groupByLabel } from '@/lib/utils/catalogGroups';
import { formatJalali } from '@/lib/utils/jalali';
import { API_MODE } from '@/lib/api/config';
import { api } from '@/lib/api';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { MovementBadge, DeliveryBadge, BestPriceBadge, Switch, Chip } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { Modal, PriceChart } from '@/components/lazy';
import { ExportMenu } from './ExportMenu';
import { AlertBellButton } from '@/components/alerts/AlertBellButton';
import { Sparkline } from './Sparkline';
import { HeartIcon, ChartIcon, PlusIcon, SortIcon, ChevronDownIcon } from '@/components/primitives/icons';
import styles from './PriceTable.module.css';

type SortKey = 'size' | 'price' | 'movement';

const withVat = (price: number, vat: boolean, rate: number = CONSTANTS.VAT_RATE) =>
  vat ? Math.round(price * (1 + rate)) : price;

/** Shared row comparator — used for the per-factory sections. The by-size
 *  view has its own fixed price-ascending order (with hidden prices pushed
 *  to the end, see `orderBySizeRows` below) since comparing price IS its
 *  job, independent of the toolbar's `sort` control. */
function compareRows(a: PriceRow, b: PriceRow, sort: SortKey): number {
  if (sort === 'price') return a.current.price - b.current.price;
  if (sort === 'movement') return (b.current.movementPct ?? 0) - (a.current.movementPct ?? 0);
  // `Number('۱۴')` is NaN — every stored size is in Persian digits, so this
  // comparator silently returned NaN for every pair and the «سایز» sort did
  // nothing at all.
  return Number(normalizeDigits(a.size ?? '0')) - Number(normalizeDigits(b.size ?? '0'));
}

/**
 * The «بر اساس سایز» ordering: real (non-hidden) prices sorted
 * cheapest-first, stale/hidden prices pushed to the end regardless of their
 * stored number. Exported (not just inlined in a `useMemo`) so this rule —
 * the one place a stale price could otherwise get falsely crowned "best" —
 * has a direct unit test independent of rendering the whole table.
 *
 * A stale-hidden row's stored `current.price` can still be an old, possibly
 * rock-bottom number even though the UI shows «تماس بگیرید» for it (see
 * `priceFreshness.ts` — the price is withheld from *display*, not deleted
 * from the row), so naively sorting the full list by `current.price` could
 * let a months-old price win "best price" over every real, current one.
 */
export function orderBySizeRows(rows: PriceRow[]): PriceRow[] {
  const visible = rows
    .filter((r) => !r.current.priceHidden)
    .sort((a, b) => a.current.price - b.current.price);
  const hidden = rows.filter((r) => r.current.priceHidden);
  return [...visible, ...hidden];
}

/** The best-price winner for an already-ordered by-size row list, or
 *  `undefined` if every row is stale/hidden (a real, expected state pre-
 *  launch — see the site's own price-freshness rules — that must never
 *  crash or badge a hidden row). */
export function bestPriceRowId(ordered: PriceRow[]): string | undefined {
  return ordered.find((r) => !r.current.priceHidden)?.id;
}

type RowActions = {
  onToggleFav: (id: string) => void;
  onChart: (row: PriceRow) => void;
  onAddToCart: (row: PriceRow) => void;
};

/** US-02.9 — 2 to 4 rows only (a wider compare table stops being scannable). */
const MAX_COMPARE = 4;

/**
 * One desktop table row. Memoized so toggling a favorite / opening the chart
 * modal / anything else that only affects one row doesn't re-render every
 * other row too — `isFav` and `vat` are plain primitives (not the parent's
 * `fav` Set) and the callbacks are stable (`useCallback` in the parent), so
 * `React.memo`'s default shallow comparison actually catches "nothing
 * relevant to this row changed".
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
}: {
  row: PriceRow;
  vat: boolean;
  vatRate: number;
  isFav: boolean;
  compareChecked: boolean;
  onToggleCompare: (id: string) => void;
  /** ورق only — must stay in lockstep with the matching `<th>` in the header,
   *  which is driven by the same flag. */
  showDimensions: boolean;
} & RowActions) {
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={compareChecked}
          onChange={() => onToggleCompare(r.id)}
          aria-label={`افزودن ${r.name} به مقایسه`}
        />
      </td>
      <th scope="row" className={styles.name}>
        <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)} className={styles.nameLink}>
          {r.name}
        </Link>
      </th>
      <td>{r.size ? toPersianDigits(r.size) : 'نامشخص'}</td>
      {showDimensions ? (
        <td className={styles.muted}>{r.dimensions ? toPersianDigits(r.dimensions) : 'نامشخص'}</td>
      ) : null}
      <td className={styles.muted}>{r.grade ?? 'نامشخص'}</td>
      <td className={styles.muted}>{r.factory ?? 'نامشخص'}</td>
      <td className={styles.num}>
        {r.theoreticalWeightKg ? (
          <>
            {toPersianDigits(r.theoreticalWeightKg)} <bdi lang="en">kg</bdi>
          </>
        ) : (
          'نامشخص'
        )}
      </td>
      <td className={`${styles.num} ${styles.price}`}>
        {priceHiddenLabel(r.current) ?? formatToman(withVat(r.current.price, vat, vatRate), false)}
      </td>
      <td className={styles.num}>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
      </td>
      <td className={styles.muted}>{formatJalali(r.current.updatedAt, 'MM/dd')}</td>
      <td>
        <DeliveryBadge value={r.current.deliveryTime} />
      </td>
      <td>
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
            <PlusIcon size={16} /> سبد
          </button>
        </div>
      </td>
    </tr>
  );
});

/** One mobile card — same memoization rationale as `PriceTableRow`. */
const PriceTableCard = memo(function PriceTableCard({
  row: r,
  vat,
  vatRate,
  isFav,
  onToggleFav,
  onChart,
  onAddToCart,
  showDimensions,
}: {
  row: PriceRow;
  vat: boolean;
  vatRate: number;
  isFav: boolean;
  /** ورق only — same flag the desktop header/rows use. */
  showDimensions: boolean;
} & RowActions) {
  return (
    <li className={styles.card}>
      <div className={styles.cardTop}>
        <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)} className={styles.cardName}>
          {r.name}
        </Link>
        <div className={styles.cardTopActions}>
          <AlertBellButton
            target={{ type: 'sku', skuId: r.id, label: r.name, currentValue: r.current.price }}
          />
          <IconButton
            size="sm"
            label="علاقه‌مندی"
            active={isFav}
            icon={<HeartIcon size={18} filled={isFav} />}
            onClick={() => onToggleFav(r.id)}
          />
        </div>
      </div>
      <div className={styles.cardPrice}>
        <span className={`${styles.price} tnum`}>
          {priceHiddenLabel(r.current) ?? formatToman(withVat(r.current.price, vat, vatRate), false)}
        </span>
        <span className={styles.unit}>تومان / کیلوگرم</span>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} pill />
      </div>
      <div className={styles.cardMeta}>
        <span>کارخانه: {r.factory ?? 'نامشخص'}</span>
        {r.grade ? <span>گرید: {r.grade}</span> : null}
        {/* size intentionally omitted — the product name already ends in it */}
        {/* ابعاد is NOT in the name, so unlike size it has to be shown here or
            a phone user never sees it at all. Only when it's actually filled
            in — the card is a compact summary, not a spec sheet, and a «نامشخص»
            line would be pure noise on the majority of plates today. */}
        {showDimensions && r.dimensions ? (
          <span>
            {DIMENSIONS_LABEL}: <bdi className="tnum">{toPersianDigits(r.dimensions)}</bdi>
          </span>
        ) : null}
        {r.theoreticalWeightKg ? (
          <span>
            وزن شاخه {toPersianDigits(r.theoreticalWeightKg)} <bdi lang="en">kg</bdi>
          </span>
        ) : null}
        <span>به‌روزرسانی {formatJalali(r.current.updatedAt, 'MM/dd')}</span>
        <DeliveryBadge value={r.current.deliveryTime} />
      </div>
      <div className={styles.cardActions}>
        <button className={styles.ghostBtn} onClick={() => onChart(r)}>
          <ChartIcon size={16} /> نمودار
        </button>
        <button
          className={styles.addBtnFull}
          onClick={() => onAddToCart(r)}
          disabled={r.current.priceHidden}
          title={r.current.priceHidden ? 'برای این کالا باید تماس بگیرید.' : undefined}
        >
          <PlusIcon size={16} /> افزودن به سبد استعلام
        </button>
      </div>
    </li>
  );
});

/**
 * One row of the «بر اساس سایز» quick-compare view — one factory's price for
 * the currently-selected size. Deliberately a separate, leaner component
 * from `PriceTableRow`/`PriceTableCard`: showing a constant «سایز» column N
 * times would be noise here (the size is fixed for the whole view, named
 * once in the heading), and this view carries two things the full table
 * doesn't — the sparkline and the best-price badge.
 */
const BySizeRow = memo(function BySizeRow({
  row: r,
  vat,
  vatRate,
  isBest,
  isFav,
  history,
  onToggleFav,
  onChart,
  onAddToCart,
}: { row: PriceRow; vat: boolean; vatRate: number; isBest: boolean; isFav: boolean; history?: number[] } & RowActions) {
  return (
    <tr className={isBest ? styles.bestRow : undefined}>
      <th scope="row" className={styles.muted}>
        {r.factory ?? 'نامشخص'}
      </th>
      <td className={`${styles.num} ${styles.price}`}>
        <div className={styles.bySizePriceCell}>
          {priceHiddenLabel(r.current) ?? formatToman(withVat(r.current.price, vat, vatRate), false)}
          {isBest ? <BestPriceBadge /> : null}
        </div>
      </td>
      <td className={styles.num}>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
      </td>
      <td>{history && history.length >= 2 ? <Sparkline points={history} /> : null}</td>
      <td>
        <DeliveryBadge value={r.current.deliveryTime} />
      </td>
      <td>
        <div className={styles.actions}>
          <IconButton
            size="sm"
            label="افزودن به علاقه‌مندی"
            active={isFav}
            icon={<HeartIcon size={18} filled={isFav} />}
            onClick={() => onToggleFav(r.id)}
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
            <PlusIcon size={16} /> سبد
          </button>
        </div>
      </td>
    </tr>
  );
});

/** Mobile card twin of `BySizeRow` — the desktop `<table>` above is `display:
 *  none` under the site's 767px breakpoint (same rule every other table on
 *  this page follows), so without this the whole by-size comparison would
 *  render nothing at all on a phone. Same fields, stacked-card layout. */
const BySizeCard = memo(function BySizeCard({
  row: r,
  vat,
  vatRate,
  isBest,
  isFav,
  history,
  onToggleFav,
  onChart,
  onAddToCart,
}: { row: PriceRow; vat: boolean; vatRate: number; isBest: boolean; isFav: boolean; history?: number[] } & RowActions) {
  return (
    <li className={`${styles.card} ${isBest ? styles.bestRow : ''}`}>
      <div className={styles.cardTop}>
        <span className={styles.cardName}>{r.factory ?? 'نامشخص'}</span>
        <div className={styles.cardTopActions}>
          <IconButton
            size="sm"
            label="علاقه‌مندی"
            active={isFav}
            icon={<HeartIcon size={18} filled={isFav} />}
            onClick={() => onToggleFav(r.id)}
          />
        </div>
      </div>
      <div className={styles.cardPrice}>
        <span className={`${styles.price} tnum`}>
          {priceHiddenLabel(r.current) ?? formatToman(withVat(r.current.price, vat, vatRate), false)}
        </span>
        <span className={styles.unit}>تومان / کیلوگرم</span>
        {isBest ? <BestPriceBadge /> : null}
      </div>
      <div className={styles.cardMeta}>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} pill />
        {history && history.length >= 2 ? <Sparkline points={history} /> : null}
        <DeliveryBadge value={r.current.deliveryTime} />
      </div>
      <div className={styles.cardActions}>
        <button className={styles.ghostBtn} onClick={() => onChart(r)}>
          <ChartIcon size={16} /> نمودار
        </button>
        <button
          className={styles.addBtnFull}
          onClick={() => onAddToCart(r)}
          disabled={r.current.priceHidden}
          title={r.current.priceHidden ? 'برای این کالا باید تماس بگیرید.' : undefined}
        >
          <PlusIcon size={16} /> افزودن به سبد استعلام
        </button>
      </div>
    </li>
  );
});

/** Bounded batch of price-history fetches for the rows currently visible in
 *  the by-size view (a handful of factories for one size — never the whole
 *  catalog). Reuses the same public per-SKU endpoint the chart modal already
 *  calls; there is no batch history API in this codebase to build a single
 *  request from, so this is N parallel requests where N = number of
 *  factories offering the selected size (typically 5-20, never unbounded —
 *  it is NOT fetched for the full by-factory section list below, which can
 *  run into the hundreds of rows). */
function useBySizeHistory(rows: PriceRow[]): Map<string, number[]> {
  const results = useQueries({
    queries: rows.map((r) => ({
      queryKey: ['sku-history-spark', r.slug],
      queryFn: () => api.catalog.history(r.slug, r.current.price, '30d'),
      staleTime: 5 * 60 * 1000,
      enabled: !r.current.priceHidden,
    })),
  });
  return useMemo(() => {
    const map = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const points = results[i]?.data?.points;
      if (points && points.length >= 2) map.set(r.id, points.map((p) => p.price));
    });
    return map;
  }, [rows, results]);
}

/**
 * E1 · The Datasheet — the signature price table, redesigned (US-Price-Redesign)
 * around the two views a real buyer actually wants:
 *
 * 1. **«بر اساس سایز»** (top, primary) — pick a size, see every factory's
 *    price for that exact size side by side, cheapest first, with a
 *    best-price badge and an inline trend sparkline. Answers "I need size 8,
 *    who's cheapest?" without any scrolling.
 * 2. **«بر اساس کارخانه»** (below, one `<details>` section per factory) —
 *    every factory gets its own heading and full size table, matching the
 *    structure the owner asked for (mirrors ahanprice.com's per-factory
 *    pages) — real, crawlable headings for long-tail SEO ("قیمت میلگرد
 *    کویر کاشان"), collapsed by default past the first few so the page
 *    doesn't become an unscannable wall of tables. `<details>`/`<summary>`
 *    (not a hand-rolled accordion) so this is keyboard-operable and
 *    ARIA-correct for free, AND so every section's full content is in the
 *    server-rendered HTML regardless of open/closed state — collapsing is a
 *    pure CSS/browser affordance, nothing is conditionally unmounted, so a
 *    crawler sees everything a human would after clicking "expand all".
 *
 * A quick-jump chip row (something neither ahanprice nor our old flat table
 * had) lets a visitor who already knows their factory skip straight to its
 * section instead of scrolling past everyone else's.
 *
 * The existing compare-checkbox feature (US-02.9) now spans BOTH views and
 * every factory section at once — `compareIds` was already just a Set of
 * SKU ids, so nothing about it needed to change to work across sections.
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
}) {
  const sizeCol = sizeLabel(categorySlug);
  const subGroups = useMemo(() => groupByLabel(subs), [subs]);
  // ورق only. Driven by the PAGE's category for the same reason `sizeCol` is:
  // a mixed list (the «استیل» hub, via cross-listing) must not grow an «ابعاد»
  // column just because one sheet row wandered into it.
  const showDimensions = usesDimensions(categorySlug);
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [vat, setVat] = useState(false);
  const [sort, setSort] = useState<SortKey>('size');
  const [internalSub, setInternalSub] = useState<string | null>(initialSub);
  const controlled = onSubChange !== undefined;
  const sub = controlled ? (subProp ?? null) : internalSub;

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

  // Only the SUB-CATEGORY (ساده/آجدار/…) narrows the row set now — «کارخانه»
  // and «سایز» used to be independent dropdown filters on one flat list; they
  // are now the two views below (by-factory sections, by-size comparison),
  // not filters that hide rows from each other.
  const subFiltered = useMemo(
    () => rows.filter((r) => !sub || r.subCategoryId === sub),
    [rows, sub],
  );

  const sizeOptions = useMemo(
    () =>
      [...new Set(subFiltered.map((r) => r.size).filter((s): s is string => Boolean(s)))].sort(
        (a, b) => Number(normalizeDigits(a)) - Number(normalizeDigits(b)) || a.localeCompare(b, 'fa'),
      ),
    [subFiltered],
  );
  // The size with the most factory coverage — this is what the "by size"
  // view should default to, NOT just the numerically-smallest size. The
  // whole point of that view is a side-by-side factory comparison; landing
  // on a size only one or two factories carry defeats it and reads as
  // broken on first load, even though every number shown would still be
  // accurate. (Found via a real curl against seeded data, not by
  // inspection: the smallest rebar size had exactly one factory row.)
  const bestCoverageSize = useMemo(() => {
    if (sizeOptions.length === 0) return null;
    const counts = new Map<string, number>();
    for (const r of subFiltered) {
      if (!r.size) continue;
      counts.set(r.size, (counts.get(r.size) ?? 0) + 1);
    }
    return sizeOptions.reduce(
      (best, s) => ((counts.get(s) ?? 0) > (counts.get(best) ?? 0) ? s : best),
      sizeOptions[0]!,
    );
  }, [subFiltered, sizeOptions]);
  // Seeded from `bestCoverageSize` directly (a lazy initializer, not an
  // effect) so the very FIRST render — server-side included — already shows
  // a real comparison instead of an empty "برای این سایز کالایی ثبت نشده
  // است." that only fills in after a client-side effect runs.
  // `bestCoverageSize` only depends on props (`rows`/`sub`), never
  // `window`/`document`, so this produces byte-identical output on the
  // server and the pre-hydration client render — no hydration mismatch,
  // unlike the `?factory=` deep link below, which genuinely does need
  // `window.location` and therefore does need a `useEffect`.
  const [bySize, setBySizeState] = useState<string | null>(() => bestCoverageSize);
  const setBySize = (next: string | null) => withTransition(() => setBySizeState(next));
  // Re-sync when the AVAILABLE sizes change post-mount (switching ساده↔آجدار
  // sub-category), which the lazy initializer above can't react to on its
  // own — don't fight a user who's already picked a still-valid size.
  useEffect(() => {
    if (sizeOptions.length === 0) {
      setBySizeState(null);
      return;
    }
    setBySizeState((current) => (current && sizeOptions.includes(current) ? current : bestCoverageSize));
  }, [sizeOptions, bestCoverageSize]);

  // «بر اساس سایز» rows — see `orderBySizeRows`'s docstring for why hidden
  // prices can't just be sorted by their raw stored value.
  const bySizeRows = useMemo(() => {
    if (!bySize) return [];
    return orderBySizeRows(subFiltered.filter((r) => r.size === bySize));
  }, [subFiltered, bySize]);
  const bestPriceId = bestPriceRowId(bySizeRows);
  const bySizeHistory = useBySizeHistory(bySizeRows);

  // «بر اساس کارخانه» sections — grouped from the same sub-filtered rows,
  // each group internally sorted by the toolbar's `sort` control (size by
  // default, same comparator the old flat table used).
  const byFactory = useMemo(() => {
    const map = new Map<string, PriceRow[]>();
    for (const r of subFiltered) {
      const key = r.factory ?? 'سایر';
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    for (const list of map.values()) list.sort((a, b) => compareRows(a, b, sort));
    // Cheapest-overall-visible-price factory first, so the first couple of
    // sections default-open to something actually useful rather than
    // whatever happened to sort first alphabetically/by insertion order.
    return [...map.entries()].sort(([, a], [, b]) => {
      const av = a.find((r) => !r.current.priceHidden)?.current.price ?? Infinity;
      const bv = b.find((r) => !r.current.priceHidden)?.current.price ?? Infinity;
      return av - bv;
    });
  }, [subFiltered, sort]);
  const factoryIndex = useMemo(
    () => new Map(byFactory.map(([name], i) => [name, i] as const)),
    [byFactory],
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
    const idx = factoryIndex.get(fromUrl);
    if (idx === undefined) return;
    const el = document.getElementById(`factory-section-${idx}`);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryIndex]);

  const jumpToFactory = (name: string) => {
    const idx = factoryIndex.get(name);
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

  const addToCart = useCallback(
    (r: PriceRow) => {
      add({
        skuId: r.id,
        name: r.name,
        qty: 1,
        unit: r.unit,
        unitPrice: r.current.price,
        weightKg: r.theoreticalWeightKg,
      });
      toast.success(`${r.name} به سبد استعلام اضافه شد.`, {
        label: 'مشاهده سبد',
        href: routes.cart(),
      });
    },
    [add, toast],
  );

  const updated = rows[0]?.current.updatedAt;
  const selectedForCompare = useMemo(() => rows.filter((r) => compareIds.has(r.id)), [rows, compareIds]);
  const exportRows = useMemo(
    () => byFactory.flatMap(([, list]) => list),
    [byFactory],
  );

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
              <div key={`g_${group.label}`} className={styles.subGroup} role="group" aria-label={group.label}>
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
            <span className="visually-hidden">مرتب‌سازی بخش‌های کارخانه</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={styles.select}
              aria-label="مرتب‌سازی بخش‌های کارخانه"
            >
              <option value="size">{sizeCol}</option>
              <option value="price">قیمت</option>
              <option value="movement">نوسان</option>
            </select>
          </label>
          <Switch checked={vat} onChange={setVat} label="با ارزش‌افزوده" />
          <ExportMenu rows={exportRows} title={categoryName} categorySlug={categorySlug} />
          <button
            type="button"
            className={styles.compareLink}
            disabled={selectedForCompare.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            مقایسه {selectedForCompare.length > 0 ? `(${toPersianDigits(selectedForCompare.length)})` : ''}
          </button>
        </div>
      </div>

      <div className={styles.meta}>
        <span>
          {toPersianDigits(subFiltered.length)} کالا · {toPersianDigits(byFactory.length)} کارخانه
          {updated ? ` · به‌روزرسانی ${formatJalali(updated)}` : ''}
        </span>
        <span className={styles.note}>قیمت‌ها به تومان و برای هر کیلوگرم است.</span>
      </div>

      {/* ===== بر اساس سایز — quick compare ===== */}
      {sizeOptions.length > 0 && (
        <section className={styles.bySizeSection} aria-labelledby="by-size-heading">
          <div className={styles.bySizeHead}>
            <h2 id="by-size-heading" className={styles.bySizeTitle}>
              مقایسهٔ سریع بر اساس {sizeCol}
            </h2>
            <label className={styles.sizePicker}>
              {sizeCol}
              <select
                value={bySize ?? ''}
                onChange={(e) => setBySize(e.target.value || null)}
                className={styles.select}
                aria-label={`انتخاب ${sizeCol} برای مقایسه`}
              >
                {sizeOptions.map((s) => (
                  <option key={s} value={s}>
                    {toPersianDigits(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {bySizeRows.length > 0 ? (
            <div className={styles.tableScroll} role="region" aria-label={`مقایسهٔ کارخانه‌ها برای این ${sizeCol}`} tabIndex={0}>
              <table className={`${styles.table} ${styles.bySizeTable} tnum`}>
                <caption className="visually-hidden">
                  مقایسهٔ قیمت {categoryName} {sizeCol} {toPersianDigits(bySize ?? '')} بین کارخانه‌ها
                </caption>
                <thead>
                  <tr>
                    <th scope="col">کارخانه</th>
                    <th scope="col" className={styles.num}>
                      قیمت (تومان)
                    </th>
                    <th scope="col" className={styles.num}>
                      نوسان
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">روند اخیر</span>
                    </th>
                    <th scope="col">تحویل</th>
                    <th scope="col" className={styles.actionsCol}>
                      عملیات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bySizeRows.map((r) => (
                    <BySizeRow
                      key={r.id}
                      row={r}
                      vat={vat}
                      vatRate={vatRate}
                      isBest={r.id === bestPriceId}
                      isFav={fav.has(r.id)}
                      history={bySizeHistory.get(r.id)}
                      onToggleFav={toggleFav}
                      onChart={setChartFor}
                      onAddToCart={addToCart}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {bySizeRows.length > 0 ? (
            <ul className={styles.cards}>
              {bySizeRows.map((r) => (
                <BySizeCard
                  key={r.id}
                  row={r}
                  vat={vat}
                  vatRate={vatRate}
                  isBest={r.id === bestPriceId}
                  isFav={fav.has(r.id)}
                  history={bySizeHistory.get(r.id)}
                  onToggleFav={toggleFav}
                  onChart={setChartFor}
                  onAddToCart={addToCart}
                />
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>برای این {sizeCol} کالایی ثبت نشده است.</p>
          )}
        </section>
      )}

      {/* ===== پرش سریع به کارخانه ===== */}
      {byFactory.length > 1 && (
        <nav className={styles.quickJump} aria-label="پرش به کارخانه">
          {byFactory.map(([name]) => (
            <button key={name} type="button" className={styles.quickJumpChip} onClick={() => jumpToFactory(name)}>
              {name}
            </button>
          ))}
        </nav>
      )}

      {/* ===== بر اساس کارخانه — one section per factory ===== */}
      <div className={styles.factoryList}>
        {byFactory.map(([name, list], i) => {
          const cheapest = list.find((r) => !r.current.priceHidden);
          return (
            <details
              key={name}
              id={`factory-section-${i}`}
              className={styles.factorySection}
              open={i < DEFAULT_OPEN_COUNT}
            >
              <summary className={styles.factorySummary}>
                <span className={styles.factorySummaryMain}>
                  <ChevronDownIcon size={18} className={styles.factoryChevron} />
                  <h2 className={styles.factoryTitle}>
                    قیمت {categoryName} {name}
                  </h2>
                </span>
                <span className={styles.factorySummaryMeta}>
                  {toPersianDigits(list.length)} {sizeCol}
                  {cheapest ? (
                    <>
                      {' '}
                      · از {formatToman(withVat(cheapest.current.price, vat, vatRate), false)} تومان
                    </>
                  ) : null}
                </span>
              </summary>

              <div className={styles.factoryBody}>
                {/* Desktop table */}
                <div className={styles.tableScroll} role="region" aria-label={`قیمت ${categoryName} ${name}`} tabIndex={0}>
                  <table className={`${styles.table} tnum`}>
                    <caption className="visually-hidden">
                      قیمت {categoryName} {name}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">
                          <span className="visually-hidden">مقایسه</span>
                        </th>
                        <th scope="col">محصول</th>
                        <th scope="col" aria-sort={sort === 'size' ? 'ascending' : 'none'}>
                          {sizeCol}
                        </th>
                        {/* ورق only — and deliberately NOT sortable: «۱۰۰۰×۲۰۰۰»
                            is a pair, not a number, so there is no ordering the
                            `size`/price/movement comparator could honour. */}
                        {showDimensions ? <th scope="col">{DIMENSIONS_LABEL}</th> : null}
                        <th scope="col">گرید</th>
                        <th scope="col">کارخانه</th>
                        <th scope="col" className={styles.num}>
                          وزن شاخه
                        </th>
                        <th scope="col" className={styles.num} aria-sort={sort === 'price' ? 'ascending' : 'none'}>
                          قیمت (تومان)
                        </th>
                        <th scope="col" className={styles.num} aria-sort={sort === 'movement' ? 'descending' : 'none'}>
                          نوسان
                        </th>
                        <th scope="col">تاریخ</th>
                        <th scope="col">تحویل</th>
                        <th scope="col" className={styles.actionsCol}>
                          عملیات
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <PriceTableRow
                          key={r.id}
                          row={r}
                          vat={vat}
                          vatRate={vatRate}
                          isFav={fav.has(r.id)}
                          compareChecked={compareIds.has(r.id)}
                          onToggleCompare={toggleCompare}
                          showDimensions={showDimensions}
                          onToggleFav={toggleFav}
                          onChart={setChartFor}
                          onAddToCart={addToCart}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <ul className={styles.cards}>
                  {list.map((r) => (
                    <PriceTableCard
                      key={r.id}
                      row={r}
                      vat={vat}
                      vatRate={vatRate}
                      isFav={fav.has(r.id)}
                      showDimensions={showDimensions}
                      onToggleFav={toggleFav}
                      onChart={setChartFor}
                      onAddToCart={addToCart}
                    />
                  ))}
                </ul>
              </div>
            </details>
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

      {/* Side-by-side comparison (US-02.9) — 2 to 4 rows, now spans every
          factory section and the by-size view alike since `compareIds` is
          just a Set of ids, independent of which view a checkbox lives in. */}
      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title="مقایسهٔ کالاها">
        {selectedForCompare.length < 2 ? null : (
          <div className={styles.compareScroll}>
            <table className={`${styles.compareTable} tnum`}>
              <caption className="visually-hidden">مقایسهٔ مشخصات و قیمت کالاهای انتخاب‌شده</caption>
              <tbody>
                <tr>
                  <th scope="row">محصول</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>
                      <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)} onClick={() => setCompareOpen(false)}>
                        {r.name}
                      </Link>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{sizeCol}</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>{r.size ? toPersianDigits(r.size) : 'نامشخص'}</td>
                  ))}
                </tr>
                {/* ورق only — the whole point of comparing two plates is often
                    that they differ here and nowhere else. */}
                {showDimensions ? (
                  <tr>
                    <th scope="row">{DIMENSIONS_LABEL}</th>
                    {selectedForCompare.map((r) => (
                      <td key={r.id}>{r.dimensions ? toPersianDigits(r.dimensions) : 'نامشخص'}</td>
                    ))}
                  </tr>
                ) : null}
                <tr>
                  <th scope="row">کارخانه</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>{r.factory ?? 'نامشخص'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">وزن شاخه</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>{r.theoreticalWeightKg ? `${toPersianDigits(r.theoreticalWeightKg)} kg` : 'نامشخص'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">قیمت (تومان)</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id} className={styles.price}>
                      {priceHiddenLabel(r.current) ?? formatToman(withVat(r.current.price, vat, vatRate), false)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">نوسان</th>
                  {selectedForCompare.map((r) => (
                    <td key={r.id}>
                      <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
                    </td>
                  ))}
                </tr>
                <tr>
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
    </div>
  );
}
