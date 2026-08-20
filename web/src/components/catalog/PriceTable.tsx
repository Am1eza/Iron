'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  usesDimensions,
  usesGradeColumn,
  gradeColumnLabel,
  gradeColumnCell,
  gradeColumnCard,
  DIMENSIONS_LABEL,
  priceBasisNoun,
  priceUnitCaption,
  singlePriceBasis,
} from '@/lib/utils/catalogLabels';
import { FactoryLink } from './FactoryLink';
import { groupByLabel } from '@/lib/utils/catalogGroups';
import { formatJalali } from '@/lib/utils/jalali';
import { API_MODE } from '@/lib/api/config';
import { api } from '@/lib/api';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { MovementBadge, DeliveryBadge, Switch, Chip } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { Modal, PriceChart } from '@/components/lazy';
import { ExportMenu } from './ExportMenu';
import { AlertBellButton } from '@/components/alerts/AlertBellButton';
import { HeartIcon, ChartIcon, PlusIcon, SortIcon, ChevronDownIcon } from '@/components/primitives/icons';
import styles from './PriceTable.module.css';

type SortKey = 'size' | 'price' | 'movement';

/** Shared row comparator — used for the per-factory sections, driven by the
 *  toolbar's `sort` control. */
function compareRows(a: PriceRow, b: PriceRow, sort: SortKey): number {
  if (sort === 'price') return a.current.price - b.current.price;
  if (sort === 'movement') return (b.current.movementPct ?? 0) - (a.current.movementPct ?? 0);
  // `Number('۱۴')` is NaN — every stored size is in Persian digits, so this
  // comparator silently returned NaN for every pair and the «سایز» sort did
  // nothing at all.
  return Number(normalizeDigits(a.size ?? '0')) - Number(normalizeDigits(b.size ?? '0'));
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
  return <FactoryLink categorySlug={categorySlug} factory={factory} className={styles.nameLink} />;
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
  showGrade,
  categorySlug,
  showRowBasis,
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
  /** «گرید»/«استاندارد» — same lockstep rule as `showDimensions`: this cell and
   *  the header `<th>` are driven by the one flag, so they can never drift out
   *  of alignment. Off only for the non-هاش تیرآهن pages. */
  showGrade: boolean;
  /** Page category — decides whether that column reads `grade` or `standard`
   *  (see catalogLabels). */
  categorySlug?: string;
  /** True only when the visible rows do NOT share one denomination, so the
   *  page-wide «قیمت‌ها … برای هر کیلوگرم است» note has been dropped. Without
   *  this the desktop table of a mixed page (میلگرد + کوپلر) printed bare
   *  numbers with nothing anywhere saying what they are per — the mobile card
   *  has always captioned itself. */
  showRowBasis: boolean;
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
      {showGrade ? <td className={styles.muted}>{gradeColumnCell(categorySlug, r)}</td> : null}
      <td className={styles.muted}>
        <FactoryCell categorySlug={r.categoryId} factory={r.factory} />
      </td>
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
        {showRowBasis && !r.current.priceHidden ? (
          <span className={styles.rowBasis}>
            {' / '}
            {priceBasisNoun(r.priceBasis, r.branchLengthM)}
          </span>
        ) : null}
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
  categorySlug,
}: {
  row: PriceRow;
  vat: boolean;
  vatRate: number;
  isFav: boolean;
  /** ورق only — same flag the desktop header/rows use. */
  showDimensions: boolean;
  /** Page category — decides whether the grade line reads `grade` or
   *  `standard`, and whether it appears at all (see catalogLabels). The card
   *  needs no `showGrade`: it omits an empty field anyway, and
   *  `gradeColumnCard` already returns null for every row the desktop column
   *  would have hidden. */
  categorySlug?: string;
} & RowActions) {
  const grade = gradeColumnCard(categorySlug, r);
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
        <span className={styles.unit}>{priceUnitCaption(r.priceBasis, r.branchLengthM)}</span>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} pill />
      </div>
      <div className={styles.cardMeta}>
        <span>
          کارخانه: <FactoryCell categorySlug={r.categoryId} factory={r.factory} />
        </span>
        {grade ? (
          <span>
            {grade.label}: {grade.value}
          </span>
        ) : null}
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
  // تیرآهن only. The «گرید» column is empty for every I-beam we sell, so the
  // owner asked for it gone — except on هاش سبک/هاش سنگین, where it becomes
  // «استاندارد» (HEA/HEB per DIN 1025, stored in `skus.standard`). Unlike
  // `showDimensions` this depends on the ACTIVE sub-filter, so it has to be
  // computed after `sub` is resolved: the mixed «همه» view still shows the
  // column, because هاش rows are in it.
  const showGrade = usesGradeColumn(categorySlug, sub);
  const gradeCol = gradeColumnLabel(categorySlug);

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

  /** Admin-placed factories, name → position. Built once per prop change so
   *  the comparator below stays an O(1) lookup. */
  const factoryRank = useMemo(
    () => new Map((factoryOrder ?? []).map((f, i) => [f, i] as const)),
    [factoryOrder],
  );

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
    return [...map.entries()].sort(([an, a], [bn, b]) => {
      // The admin's order wins wherever it has an opinion (US-18.2): the mills
      // customers ask for by name are not the cheapest ones, and leading with
      // «whoever is cheapest today» reshuffled the page daily and buried
      // ذوب‌آهن under mills nobody had heard of.
      const ar = factoryRank.get(an) ?? Infinity;
      const br = factoryRank.get(bn) ?? Infinity;
      if (ar !== br) return ar - br;
      // Both unplaced (or the admin has arranged nothing at all): cheapest
      // overall visible price first — the previous behaviour, kept verbatim
      // so a partly-filled order is never worse than no order. The «سایر»
      // bucket (rows with no factory) can only ever land here.
      const av = a.find((r) => !r.current.priceHidden)?.current.price ?? Infinity;
      const bv = b.find((r) => !r.current.priceHidden)?.current.price ?? Infinity;
      return av - bv;
    });
  }, [subFiltered, sort, factoryRank]);
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
  // `subFiltered`, not `rows`: the note sits under the sub-category filter and
  // describes what is actually on screen.
  const priceBasis = useMemo(() => singlePriceBasis(subFiltered), [subFiltered]);
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
          <Switch checked={vat} onChange={setGlobalVat} label="با ارزش‌افزوده" />
          {/* Page-wide export — every factory at once, in the page-wide VAT
              state. A section a visitor has individually overridden is NOT
              re-resolved here: this file is the "everything" export and its
              subtitle line spells out which of the two numbers it carries, so
              a recipient can never be misled. The per-section export below
              follows that section's own toggle. */}
          <ExportMenu
            rows={exportRows}
            title={categoryName}
            categorySlug={categorySlug}
            vat={vat}
            vatRate={vatRate}
          />
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
          const factoryVat = vatFor(name);
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
                      · از {formatToman(withVat(cheapest.current.price, factoryVat, vatRate), false)}{' '}
                      تومان
                    </>
                  ) : null}
                </span>
              </summary>

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
                {byFactory.length > 1 ? (
                  <div className={styles.factoryTools}>
                    <Switch
                      size="sm"
                      checked={factoryVat}
                      onChange={(next) => setFactoryVat(name, next)}
                      label="با ارزش‌افزوده"
                      ariaLabel={`با ارزش‌افزوده — ${name}`}
                    />
                    <ExportMenu
                      rows={list}
                      title={`${categoryName} ${name}`}
                      categorySlug={categorySlug}
                      vat={factoryVat}
                      vatRate={vatRate}
                      compact
                      scopeLabel={name}
                    />
                  </div>
                ) : null}

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
                        {showGrade ? <th scope="col">{gradeCol}</th> : null}
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
                          vat={factoryVat}
                          vatRate={vatRate}
                          isFav={fav.has(r.id)}
                          compareChecked={compareIds.has(r.id)}
                          onToggleCompare={toggleCompare}
                          showDimensions={showDimensions}
                          showGrade={showGrade}
                          categorySlug={categorySlug}
                          showRowBasis={priceBasis === null}
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
                      vat={factoryVat}
                      vatRate={vatRate}
                      isFav={fav.has(r.id)}
                      showDimensions={showDimensions}
                      categorySlug={categorySlug}
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

      {/* Side-by-side comparison (US-02.9) — 2 to 4 rows, spanning every
          factory section at once since `compareIds` is just a Set of ids,
          independent of which section a checkbox lives in.

          Prices here use the page-wide `vat`, not any section's override, for
          the same reason the page-wide export does: the whole point of this
          table is comparing mills to each other, and per-section VAT states
          would put two of its columns on different bases with nothing in the
          row header to say so. */}
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
