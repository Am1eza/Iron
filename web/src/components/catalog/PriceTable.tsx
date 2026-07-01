'use client';
import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, formatJalali } from '@/lib/utils/format';
import { priceSeries } from '@/lib/mock/catalogData';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { MovementBadge, DeliveryBadge, Switch, Chip, Modal } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { ExportMenu } from './ExportMenu';
import { PriceChart } from './PriceChart';
import {
  HeartIcon,
  ChartIcon,
  PlusIcon,
  SortIcon,
} from '@/components/primitives/icons';
import styles from './PriceTable.module.css';

type SortKey = 'size' | 'price' | 'movement';

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
  initialFactory = null,
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
  /** Pre-applied factory/mill filter (e.g. from the home cascade menu's
   *  «?factory=…» deep link). Shown as a clearable chip. */
  initialFactory?: string | null;
}) {
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [vat, setVat] = useState(false);
  const [sort, setSort] = useState<SortKey>('size');
  const [internalSub, setInternalSub] = useState<string | null>(initialSub);
  const controlled = onSubChange !== undefined;
  const sub = controlled ? subProp ?? null : internalSub;

  // Filter changes animate via same-document View Transitions where supported
  // (a no-op elsewhere) — the rows crossfade instead of snapping.
  const withTransition = (apply: () => void) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as Document & { startViewTransition: (cb: () => void) => void })
        .startViewTransition(() => flushSync(apply));
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
  const [chartFor, setChartFor] = useState<PriceRow | null>(null);
  const [factory, setFactoryState] = useState<string | null>(initialFactory);
  const setFactory = (next: string | null) => withTransition(() => setFactoryState(next));

  const withVat = (p: number) => (vat ? Math.round(p * (1 + CONSTANTS.VAT_RATE)) : p);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (!sub || r.subCategoryId === sub) && (!factory || r.factory === factory),
      ),
    [rows, sub, factory],
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

  const toggleFav = (id: string) => {
    if (!isAuthenticated) {
      toast.info('برای ذخیرهٔ علاقه‌مندی‌ها وارد شوید.', { label: 'ورود', href: routes.login(routes.category(rows[0]?.categoryId ?? '')) });
      return;
    }
    setFav((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addToCart = (r: PriceRow) => {
    add({
      skuId: r.id,
      name: r.name,
      qty: 1,
      unit: r.unit,
      unitPrice: r.current.price,
      weightKg: r.theoreticalWeightKg,
    });
    toast.success(`${r.name} به سبد استعلام اضافه شد.`, { label: 'مشاهده سبد', href: routes.cart() });
  };

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
          {factory && (
            <button
              type="button"
              className={styles.factoryChip}
              onClick={() => setFactory(null)}
              aria-label={`حذف فیلتر کارخانه ${factory}`}
            >
              کارخانه: {factory}
              <span className={styles.factoryClear} aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <div className={styles.tools}>
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
      <div className={styles.tableScroll} role="region" aria-label={`قیمت ${categoryName}`} tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <thead>
            <tr>
              <th scope="col">محصول</th>
              <th scope="col">سایز</th>
              <th scope="col">کارخانه</th>
              <th scope="col" className={styles.num}>وزن شاخه</th>
              <th scope="col" className={styles.num}>قیمت (تومان)</th>
              <th scope="col" className={styles.num}>نوسان</th>
              <th scope="col">تاریخ</th>
              <th scope="col">تحویل</th>
              <th scope="col" className={styles.actionsCol}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <th scope="row" className={styles.name}>{r.name}</th>
                <td>{r.size ? toPersianDigits(r.size) : '—'}</td>
                <td className={styles.muted}>{r.factory ?? '—'}</td>
                <td className={styles.num}>
                  {r.theoreticalWeightKg ? `${toPersianDigits(r.theoreticalWeightKg)} kg` : '—'}
                </td>
                <td className={`${styles.num} ${styles.price}`}>{formatToman(withVat(r.current.price), false)}</td>
                <td className={styles.num}>
                  <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
                </td>
                <td className={styles.muted}>{formatJalali(r.current.updatedAt, 'MM/dd')}</td>
                <td><DeliveryBadge value={r.current.deliveryTime} /></td>
                <td>
                  <div className={styles.actions}>
                    <IconButton
                      size="sm"
                      label="افزودن به علاقه‌مندی"
                      active={fav.has(r.id)}
                      icon={<HeartIcon size={18} filled={fav.has(r.id)} />}
                      onClick={() => toggleFav(r.id)}
                    />
                    <IconButton
                      size="sm"
                      label="نمودار قیمت"
                      icon={<ChartIcon size={18} />}
                      onClick={() => setChartFor(r)}
                    />
                    <button className={styles.addBtn} onClick={() => addToCart(r)}>
                      <PlusIcon size={16} /> سبد
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className={styles.cards}>
        {sorted.map((r) => (
          <li key={r.id} className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardName}>{r.name}</span>
              <IconButton
                size="sm"
                label="علاقه‌مندی"
                active={fav.has(r.id)}
                icon={<HeartIcon size={18} filled={fav.has(r.id)} />}
                onClick={() => toggleFav(r.id)}
              />
            </div>
            <div className={styles.cardPrice}>
              <span className={`${styles.price} tnum`}>{formatToman(withVat(r.current.price), false)}</span>
              <span className={styles.unit}>تومان / کیلوگرم</span>
              <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} pill />
            </div>
            <div className={styles.cardMeta}>
              <span>کارخانه: {r.factory ?? '—'}</span>
              <DeliveryBadge value={r.current.deliveryTime} />
            </div>
            <div className={styles.cardActions}>
              <button className={styles.ghostBtn} onClick={() => setChartFor(r)}>
                <ChartIcon size={16} /> نمودار
              </button>
              <button className={styles.addBtnFull} onClick={() => addToCart(r)}>
                <PlusIcon size={16} /> افزودن به سبد استعلام
              </button>
            </div>
          </li>
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
