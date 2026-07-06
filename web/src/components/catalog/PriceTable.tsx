'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, formatJalali } from '@/lib/utils/format';
import { API_MODE } from '@/lib/api/config';
import { priceSeries } from '@/lib/mock/catalogData';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { MovementBadge, DeliveryBadge, Switch, Chip } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { Modal, PriceChart } from '@/components/lazy';
import { ExportMenu } from './ExportMenu';
import { HeartIcon, ChartIcon, PlusIcon, SortIcon } from '@/components/primitives/icons';
import styles from './PriceTable.module.css';

type SortKey = 'size' | 'price' | 'movement';

const withVat = (price: number, vat: boolean) =>
  vat ? Math.round(price * (1 + CONSTANTS.VAT_RATE)) : price;

type RowActions = {
  onToggleFav: (id: string) => void;
  onChart: (row: PriceRow) => void;
  onAddToCart: (row: PriceRow) => void;
};

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
  isFav,
  onToggleFav,
  onChart,
  onAddToCart,
}: { row: PriceRow; vat: boolean; isFav: boolean } & RowActions) {
  return (
    <tr>
      <th scope="row" className={styles.name}>
        <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)} className={styles.nameLink}>
          {r.name}
        </Link>
      </th>
      <td>{r.size ? toPersianDigits(r.size) : '—'}</td>
      <td className={styles.muted}>{r.factory ?? '—'}</td>
      <td className={styles.num}>
        {r.theoreticalWeightKg ? (
          <>
            {toPersianDigits(r.theoreticalWeightKg)} <bdi lang="en">kg</bdi>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className={`${styles.num} ${styles.price}`}>
        {formatToman(withVat(r.current.price, vat), false)}
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
          <IconButton
            size="sm"
            label="نمودار قیمت"
            icon={<ChartIcon size={18} />}
            onClick={() => onChart(r)}
          />
          <button className={styles.addBtn} onClick={() => onAddToCart(r)}>
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
  isFav,
  onToggleFav,
  onChart,
  onAddToCart,
}: { row: PriceRow; vat: boolean; isFav: boolean } & RowActions) {
  return (
    <li className={styles.card}>
      <div className={styles.cardTop}>
        <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)} className={styles.cardName}>
          {r.name}
        </Link>
        <IconButton
          size="sm"
          label="علاقه‌مندی"
          active={isFav}
          icon={<HeartIcon size={18} filled={isFav} />}
          onClick={() => onToggleFav(r.id)}
        />
      </div>
      <div className={styles.cardPrice}>
        <span className={`${styles.price} tnum`}>
          {formatToman(withVat(r.current.price, vat), false)}
        </span>
        <span className={styles.unit}>تومان / کیلوگرم</span>
        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} pill />
      </div>
      <div className={styles.cardMeta}>
        <span>کارخانه: {r.factory ?? '—'}</span>
        {r.size ? <span>سایز {toPersianDigits(r.size)}</span> : null}
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
        <button className={styles.addBtnFull} onClick={() => onAddToCart(r)}>
          <PlusIcon size={16} /> افزودن به سبد استعلام
        </button>
      </div>
    </li>
  );
});

/**
 * E1 · The Datasheet — the signature price table. Toolbar (sub-category filter ·
 * sort · VAT toggle · exports), a real <table> on desktop, and stacked cards on
 * mobile. VAT/unit recompute live; the date column is our innovation; the chart
 * button opens a history modal; rows add to the inquiry cart. Numbers tabular.
 */
export function PriceTable({
  rows,
  subs,
  categoryName,
  sub: subProp,
  onSubChange,
  initialSub = null,
}: {
  rows: PriceRow[];
  subs: SubCat[];
  categoryName: string;
  /** Controlled active sub-category slug (or null = همه). When provided with
   *  `onSubChange`, the toolbar filter is driven by the parent and stays in
   *  sync with the sub-group selection band. */
  sub?: string | null;
  onSubChange?: (sub: string | null) => void;
  /** Initial sub for the uncontrolled case (e.g. deep-link landing). */
  initialSub?: string | null;
}) {
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
  const [factory, setFactoryState] = useState<string | null>(null);
  const setFactory = (next: string | null) => withTransition(() => setFactoryState(next));
  const [size, setSizeState] = useState<string | null>(null);
  const setSize = (next: string | null) => withTransition(() => setSizeState(next));

  // Pre-select the کارخانه filter from a «?factory=…» deep link (e.g. the home
  // cascade menu). Read via plain `window.location` on mount rather than the
  // server-provided `searchParams` prop — the page passing that through would
  // force per-request dynamic rendering (opting the whole route out of ISR)
  // just to pre-select a client-side dropdown.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('factory');
    if (fromUrl) setFactoryState(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const factoryOptions = useMemo(
    () => [...new Set(rows.map((r) => r.factory).filter((f): f is string => Boolean(f)))],
    [rows],
  );
  const sizeOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.size).filter((s): s is string => Boolean(s)))].sort(
        (a, b) => Number(a) - Number(b) || a.localeCompare(b, 'fa'),
      ),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!sub || r.subCategoryId === sub) &&
          (!factory || r.factory === factory) &&
          (!size || r.size === size),
      ),
    [rows, sub, factory, size],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sort === 'price') return a.current.price - b.current.price;
      if (sort === 'movement') return (b.current.movementPct ?? 0) - (a.current.movementPct ?? 0);
      return Number(a.size ?? 0) - Number(b.size ?? 0);
    });
    return copy;
  }, [filtered, sort]);

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

  return (
    <div className={styles.wrap}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.subs}>
          <Chip variant="filter" selected={sub === null} onClick={() => setSub(null)}>
            همه
          </Chip>
          {subs.map((s) => (
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
        <div className={styles.tools}>
          <select
            value={factory ?? ''}
            onChange={(e) => setFactory(e.target.value || null)}
            className={styles.select}
            aria-label="فیلتر کارخانه"
          >
            <option value="">همهٔ کارخانه‌ها</option>
            {factoryOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={size ?? ''}
            onChange={(e) => setSize(e.target.value || null)}
            className={styles.select}
            aria-label="فیلتر سایز"
          >
            <option value="">همهٔ سایزها</option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {toPersianDigits(s)}
              </option>
            ))}
          </select>
          <label className={styles.sort}>
            <SortIcon size={16} />
            <span className="visually-hidden">مرتب‌سازی</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={styles.select}
              aria-label="مرتب‌سازی"
            >
              <option value="size">سایز</option>
              <option value="price">قیمت</option>
              <option value="movement">نوسان</option>
            </select>
          </label>
          <Switch checked={vat} onChange={setVat} label="با ارزش‌افزوده" />
          <ExportMenu rows={sorted} title={categoryName} />
          <a href="#compare" className={styles.compareLink}>
            مقایسهٔ کارخانه‌ها
          </a>
        </div>
      </div>

      <div className={styles.meta}>
        <span>
          {toPersianDigits(sorted.length)} کالا
          {updated ? ` · به‌روزرسانی ${formatJalali(updated)}` : ''}
        </span>
        <span className={styles.note}>قیمت‌ها به تومان و برای هر کیلوگرم است.</span>
      </div>

      {/* Desktop table */}
      <div
        className={styles.tableScroll}
        role="region"
        aria-label={`قیمت ${categoryName}`}
        tabIndex={0}
      >
        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">
            قیمت {categoryName}
            {updated ? ` — به‌روزرسانی ${formatJalali(updated)}` : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">محصول</th>
              <th scope="col" aria-sort={sort === 'size' ? 'ascending' : 'none'}>سایز</th>
              <th scope="col">کارخانه</th>
              <th scope="col" className={styles.num}>
                وزن شاخه
              </th>
              <th
                scope="col"
                className={styles.num}
                aria-sort={sort === 'price' ? 'ascending' : 'none'}
              >
                قیمت (تومان)
              </th>
              <th
                scope="col"
                className={styles.num}
                aria-sort={sort === 'movement' ? 'descending' : 'none'}
              >
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
            {sorted.map((r) => (
              <PriceTableRow
                key={r.id}
                row={r}
                vat={vat}
                isFav={fav.has(r.id)}
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
        {sorted.map((r) => (
          <PriceTableCard
            key={r.id}
            row={r}
            vat={vat}
            isFav={fav.has(r.id)}
            onToggleFav={toggleFav}
            onChart={setChartFor}
            onAddToCart={addToCart}
          />
        ))}
      </ul>

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
          <PriceChart series={priceSeries(chartFor.slug, chartFor.current.price)} />
        ) : null}
      </Modal>
    </div>
  );
}
