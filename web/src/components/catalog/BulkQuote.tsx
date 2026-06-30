'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/hooks/useToast';
import { useCartStore } from '@/lib/stores/cart';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { getRows } from '@/lib/mock/catalogData';
import type { PriceRow } from '@/lib/types/domain';
import { PlusIcon, CheckCircleIcon } from '@/components/primitives/icons';
import styles from './BulkQuote.module.css';

/** One factory's line in a bulk split: its representative per-kg price + line cost. */
export type FactoryLine = {
  factory: string;
  pricePerKg: number;
  lineToman: number;
  rowCount: number;
  best: boolean;
};

export type BulkSplit = {
  tonnage: number;
  totalKg: number;
  lines: FactoryLine[];
  cheapest: FactoryLine | null;
};

/**
 * Pure factory-split calculator — reused by both the BulkQuote panel and the AI
 * advisor. Groups rows by factory, takes each factory's *average* current per-kg
 * price as its representative quote, and prices the requested tonnage against it.
 * Cheapest factory is flagged `best`. Guards empty input (returns no lines).
 */
export function computeBulkSplit(rows: PriceRow[], tonnage: number): BulkSplit {
  const tons = Number.isFinite(tonnage) && tonnage > 0 ? tonnage : 0;
  const totalKg = tons * 1000;

  const byFactory = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const f = r.factory ?? 'سایر';
    const acc = byFactory.get(f) ?? { sum: 0, count: 0 };
    acc.sum += r.current.price;
    acc.count += 1;
    byFactory.set(f, acc);
  }

  const draft = [...byFactory.entries()].map(([factory, acc]) => {
    const pricePerKg = Math.round(acc.sum / acc.count);
    return {
      factory,
      pricePerKg,
      lineToman: Math.round(pricePerKg * totalKg),
      rowCount: acc.count,
    };
  });
  draft.sort((a, b) => a.pricePerKg - b.pricePerKg);

  const minPrice = draft.length > 0 ? draft[0]!.pricePerKg : 0;
  const lines: FactoryLine[] = draft.map((d) => ({ ...d, best: d.pricePerKg === minPrice }));

  return {
    tonnage: tons,
    totalKg,
    lines,
    cheapest: lines[0] ?? null,
  };
}

const TONNAGE_PRESETS = [10, 20, 50, 100];

/**
 * خرید عمده / تفکیک کارخانه — a bulk-tonnage panel that splits the requested
 * volume across factories by their current per-kg price, highlights the cheapest
 * (gain accent) and suggests the best-value source. Mock CTAs route to the
 * inquiry flow. Surfaced on the category page (below the table) and the SKU page.
 */
export function BulkQuote({
  category,
  categoryName,
  rows: rowsProp,
  defaultTonnage = 20,
}: {
  category: string;
  categoryName: string;
  rows?: PriceRow[];
  defaultTonnage?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const add = useCartStore((s) => s.add);
  const [tonnage, setTonnage] = useState<number>(defaultTonnage);

  const rows = useMemo(() => rowsProp ?? getRows(category), [rowsProp, category]);
  const split = useMemo(() => computeBulkSplit(rows, tonnage), [rows, tonnage]);

  if (rows.length === 0) return null;

  const addToInquiry = () => {
    const best = split.cheapest;
    if (!best) return;
    add({
      skuId: `bulk-${category}-${best.factory}`,
      name: `${categoryName} عمده — کارخانهٔ ${best.factory}`,
      qty: split.totalKg,
      unit: 'kg',
      unitPrice: best.pricePerKg,
      weightKg: split.totalKg,
    });
    toast.success('استعلام عمده به سبد اضافه شد.', {
      label: 'مشاهده سبد',
      href: routes.cart(),
    });
  };

  return (
    <section className={styles.panel} aria-labelledby="bulk-title">
      <header className={styles.head}>
        <div>
          <h2 id="bulk-title" className={styles.title}>
            خرید عمده / تفکیک کارخانه
          </h2>
          <p className={styles.sub}>
            تناژ موردنظر را وارد کنید تا هزینهٔ {categoryName} را به تفکیک کارخانه ببینید و
            ارزان‌ترین گزینه را انتخاب کنید.
          </p>
        </div>
      </header>

      <div className={styles.controls}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>تناژ سفارش (تن)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={tonnage}
            onChange={(e) => {
              const n = Number(e.target.value);
              setTonnage(Number.isFinite(n) && n > 0 ? n : 0);
            }}
            className={styles.input}
            aria-label="تناژ سفارش به تن"
          />
        </label>
        <div className={styles.presets} role="group" aria-label="تناژهای پیشنهادی">
          {TONNAGE_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.preset}
              aria-pressed={tonnage === t}
              data-active={tonnage === t ? '' : undefined}
              onClick={() => setTonnage(t)}
            >
              {toPersianDigits(t)} تن
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableScroll} role="region" aria-label="تفکیک کارخانه" tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <thead>
            <tr>
              <th scope="col">کارخانه</th>
              <th scope="col" className={styles.num}>قیمت هر کیلوگرم</th>
              <th scope="col" className={styles.num}>
                هزینهٔ {toPersianDigits(split.tonnage)} تن
              </th>
            </tr>
          </thead>
          <tbody>
            {split.lines.map((l) => (
              <tr key={l.factory} className={l.best ? styles.bestRow : undefined}>
                <th scope="row" className={styles.factoryCell}>
                  <span className={styles.factoryName}>{l.factory}</span>
                  {l.best ? <span className={styles.bestTag}>بهترین قیمت</span> : null}
                </th>
                <td className={styles.num}>{formatToman(l.pricePerKg, false)}</td>
                <td className={`${styles.num} ${styles.lineCost}`}>{formatToman(l.lineToman, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {split.cheapest ? (
        <p className={styles.suggest}>
          <CheckCircleIcon size={15} aria-hidden="true" />
          <span>
            پیشنهاد: تأمین از کارخانهٔ <strong>{split.cheapest.factory}</strong> با قیمت{' '}
            <strong className="tnum">{formatToman(split.cheapest.pricePerKg, false)}</strong> تومان
            بر کیلوگرم؛ هزینهٔ تقریبی کل{' '}
            <strong className="tnum">{formatToman(split.cheapest.lineToman)}</strong>.
          </span>
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.cta} onClick={() => router.push(routes.request())}>
          دریافت پیش‌فاکتور
        </button>
        <button type="button" className={styles.ghost} onClick={addToInquiry}>
          <PlusIcon size={16} /> افزودن به سبد استعلام
        </button>
      </div>

      <p className={styles.note}>
        قیمت‌ها میانگین نرخ روز هر کارخانه‌اند و تخمینی محسوب می‌شوند؛ نرخ نهایی پس از تماس کارشناس
        اعلام می‌شود. پرداخت آنلاین نداریم.
      </p>
    </section>
  );
}
