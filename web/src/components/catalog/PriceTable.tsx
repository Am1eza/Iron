'use client';
import { useMemo, useState } from 'react';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { CONSTANTS } from '@/lib/config/constants';
import { formatToman, toPersianDigits, formatJalali } from '@/lib/utils/format';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { MovementBadge, DeliveryBadge, Switch, Chip } from '@/components/ui';
import { IconButton } from '@/components/ui';
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
 * sort · VAT toggle), a real <table> on desktop, and stacked cards on mobile.
 * VAT/unit recompute live; rows add to the inquiry cart. Numbers are tabular.
 */
export function PriceTable({
  rows,
  subs,
  categoryName,
}: {
  rows: PriceRow[];
  subs: SubCat[];
  categoryName: string;
}) {
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const [vat, setVat] = useState(false);
  const [sort, setSort] = useState<SortKey>('size');
  const [fav, setFav] = useState<Set<string>>(new Set());

  const withVat = (p: number) => (vat ? Math.round(p * (1 + CONSTANTS.VAT_RATE)) : p);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === 'price') return a.current.price - b.current.price;
      if (sort === 'movement') return (b.current.movementPct ?? 0) - (a.current.movementPct ?? 0);
      return Number(a.size ?? 0) - Number(b.size ?? 0);
    });
    return copy;
  }, [rows, sort]);

  const toggleFav = (id: string) => {
    setFav((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
    toast.success(`${r.name} به سبد استعلام اضافه شد.`);
  };

  const updated = rows[0]?.current.updatedAt;

  return (
    <div className={styles.wrap}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.subs}>
          <Chip variant="filter" selected onClick={() => {}}>
            همه
          </Chip>
          {subs.map((s) => (
            <Chip key={s.slug} variant="filter" onClick={() => {}}>
              {s.name}
            </Chip>
          ))}
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
        </div>
      </div>

      <div className={styles.meta}>
        <span>
          {toPersianDigits(rows.length)} کالا
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
                    <IconButton size="sm" label="نمودار قیمت" icon={<ChartIcon size={18} />} />
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
            <button className={styles.addBtnFull} onClick={() => addToCart(r)}>
              <PlusIcon size={16} /> افزودن به سبد استعلام
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
