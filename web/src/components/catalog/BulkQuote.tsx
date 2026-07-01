'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/hooks/useToast';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { getRows } from '@/lib/mock/catalogData';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import type { PriceRow } from '@/lib/types/domain';
import { PlusIcon, CheckCircleIcon } from '@/components/primitives/icons';
import styles from './BulkQuote.module.css';

// Re-exported so existing imports (AI advisor) keep working from one place.
export { computeBulkSplit } from '@/lib/utils/bulkSplit';
export type { BulkSplit, FactoryLine } from '@/lib/utils/bulkSplit';

const TONNAGE_PRESETS = [10, 20, 50, 100];

/**
 * «مقایسهٔ کارخانه‌ها» — the signature capability. Enter a tonnage and see the
 * same product priced across every mill: proportional price bars, the gap to the
 * cheapest, and what you save by choosing it. Anchored at #compare so the
 * landing teaser, the table toolbar and the cascade menu can deep-link here.
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
  const addRequest = useRequestsStore((s) => s.add);
  const { requireAuth } = useRequireAuth();
  const [tonnage, setTonnage] = useState<number>(defaultTonnage);

  const rows = useMemo(() => rowsProp ?? getRows(category), [rowsProp, category]);
  const split = useMemo(() => computeBulkSplit(rows, tonnage), [rows, tonnage]);

  if (rows.length === 0) return null;

  const most = split.lines[split.lines.length - 1] ?? null;
  const maxPrice = most?.pricePerKg ?? 0;
  const savings =
    split.cheapest && most && most.factory !== split.cheapest.factory
      ? most.lineToman - split.cheapest.lineToman
      : 0;

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
    <section id="compare" className={styles.panel} aria-labelledby="bulk-title">
      <header className={styles.head}>
        <div>
          <h2 id="bulk-title" className={styles.title}>
            مقایسهٔ کارخانه‌ها
          </h2>
          <p className={styles.sub}>
            تناژ موردنظر را وارد کنید تا قیمت روز {categoryName} را کارخانه‌به‌کارخانه مقایسه کنید
            و ارزان‌ترین را انتخاب کنید.
          </p>
        </div>
        <span className={styles.exclusive}>فقط در آهن‌تایم</span>
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

      <div className={styles.tableScroll} role="region" aria-label="مقایسهٔ کارخانه‌ها" tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <thead>
            <tr>
              <th scope="col">کارخانه</th>
              <th scope="col" className={styles.barCol}>
                <span className="visually-hidden">نمودار مقایسهٔ قیمت</span>
              </th>
              <th scope="col" className={styles.num}>قیمت هر کیلوگرم</th>
              <th scope="col" className={styles.num}>اختلاف با ارزان‌ترین</th>
              <th scope="col" className={styles.num}>
                هزینهٔ {toPersianDigits(split.tonnage)} تن
              </th>
            </tr>
          </thead>
          <tbody>
            {split.lines.map((l) => {
              const delta = split.cheapest ? l.pricePerKg - split.cheapest.pricePerKg : 0;
              const ratio = maxPrice > 0 ? Math.max(0.12, l.pricePerKg / maxPrice) : 0;
              return (
                <tr key={l.factory} className={l.best ? styles.bestRow : undefined}>
                  <th scope="row" className={styles.factoryCell}>
                    <span className={styles.factoryName}>{l.factory}</span>
                    {l.best ? <span className={styles.bestTag}>ارزان‌ترین</span> : null}
                  </th>
                  <td className={styles.barCol} aria-hidden="true">
                    <span className={styles.barTrack}>
                      <span
                        className={`${styles.bar} ${l.best ? styles.barBest : ''}`}
                        style={{ inlineSize: `${Math.round(ratio * 100)}%` }}
                      />
                    </span>
                  </td>
                  <td className={styles.num}>{formatToman(l.pricePerKg, false)}</td>
                  <td className={`${styles.num} ${l.best ? styles.deltaBest : styles.delta}`}>
                    {l.best ? '—' : `${formatToman(delta, false)}+`}
                  </td>
                  <td className={`${styles.num} ${styles.lineCost}`}>{formatToman(l.lineToman, false)}</td>
                </tr>
              );
            })}
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
            {savings > 0 ? (
              <>
                {' '}
                این انتخاب نسبت به گران‌ترین کارخانه حدود{' '}
                <strong className="tnum">{formatToman(savings)}</strong> صرفه‌جویی دارد.
              </>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          onClick={() =>
            // Requests live in the profile: sign in first, then file it there.
            requireAuth(() => {
              const best = split.cheapest;
              addRequest({
                type: 'bulk',
                title: `پیش‌فاکتور ${categoryName} عمده — ${toPersianDigits(split.tonnage)} تن`,
                detail: best
                  ? `پیشنهاد سیستم: کارخانهٔ ${best.factory} · ${formatToman(best.pricePerKg, false)} تومان بر کیلوگرم`
                  : undefined,
              });
              toast.success('درخواست پیش‌فاکتور ثبت شد؛ وضعیت آن در پروفایل شماست.');
              router.push(routes.account('requests'));
            })
          }
        >
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
