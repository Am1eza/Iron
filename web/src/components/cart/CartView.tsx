'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useCartStore,
  selectCartCount,
  selectCartTotalWeight,
  selectCartEstTotal,
} from '@/lib/stores/cart';
import type { CartItem } from '@/lib/stores/cart';
import type { PriceUnit } from '@/lib/types/domain';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import {
  EmptyState,
  emptyPresets,
  IconButton,
  Skeleton,
  Alert,
} from '@/components/ui';
import {
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ArrowEndIcon,
} from '@/components/primitives/icons';
import styles from './CartView.module.css';

/** کیلوگرم/شاخه/برگ/متر — display labels for the price unit. */
const UNIT_LABEL: Record<PriceUnit, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
};

/** Per-line estimate = unitPrice × (weightKg || 1) × qty (mirrors selectCartEstTotal). */
function lineEstimate(item: CartItem): number {
  return (item.unitPrice ?? 0) * (item.weightKg ?? 1) * item.qty;
}

/**
 * Inquiry cart (سبد استعلام). The cart store uses skipHydration, so we render a
 * stable placeholder until mounted to avoid an SSR/client mismatch, then show the
 * line items with a qty stepper, a sticky summary, and the «ادامه و ثبت درخواست» CTA.
 * No online payment — a کارشناس confirms the final price and delivery.
 */
export function CartView() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const items = useCartStore((s) => s.items);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);

  const count = useCartStore(selectCartCount);
  const totalWeight = useCartStore(selectCartTotalWeight);
  const estTotal = useCartStore(selectCartEstTotal);

  // Pre-hydration placeholder — calm skeleton so the layout never flashes empty.
  if (!mounted) {
    return (
      <div className={styles.skeleton} aria-hidden="true">
        <div className={styles.skeletonList}>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
        <Skeleton height={260} />
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState size="section" {...emptyPresets.cartEmpty()} />;
  }

  return (
    <div className={styles.layout}>
      {/* Line items */}
      <section className={styles.items} aria-labelledby="cart-items-title">
        <h2 id="cart-items-title" className="visually-hidden">
          اقلام سبد استعلام
        </h2>
        <ul className={styles.list}>
          {items.map((item) => {
            const est = lineEstimate(item);
            const unit = UNIT_LABEL[item.unit];
            return (
              <li key={item.skuId} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowName}>{item.name}</p>
                  <p className={styles.rowMeta}>
                    واحد: {unit}
                    {item.weightKg ? (
                      <>
                        {' · '}
                        وزن هر واحد: <span className="tnum">{toPersianDigits(item.weightKg)}</span> کیلوگرم
                      </>
                    ) : null}
                  </p>
                </div>

                <div className={styles.stepper} role="group" aria-label={`تعداد ${item.name}`}>
                  <IconButton
                    size="sm"
                    label={`کاهش تعداد ${item.name}`}
                    icon={<MinusIcon size={16} />}
                    disabled={item.qty <= 1}
                    onClick={() => setQty(item.skuId, item.qty - 1)}
                  />
                  <span className={`${styles.qty} tnum`} aria-live="polite">
                    {toPersianDigits(item.qty)}
                  </span>
                  <IconButton
                    size="sm"
                    label={`افزایش تعداد ${item.name}`}
                    icon={<PlusIcon size={16} />}
                    onClick={() => setQty(item.skuId, item.qty + 1)}
                  />
                </div>

                <div className={styles.rowEst}>
                  <span className={styles.rowEstLabel}>تخمین</span>
                  <span className={`${styles.rowEstValue} tnum`}>
                    {item.unitPrice ? formatToman(est) : 'استعلامی'}
                  </span>
                </div>

                <IconButton
                  size="sm"
                  variant="ghost"
                  className={styles.remove}
                  label={`حذف ${item.name} از سبد`}
                  icon={<TrashIcon size={18} />}
                  onClick={() => remove(item.skuId)}
                />
              </li>
            );
          })}
        </ul>

        <div className={styles.itemsFoot}>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => {
              if (window.confirm('سبد استعلام خالی شود؟')) clear();
            }}
          >
            <TrashIcon size={16} />
            خالی کردن سبد
          </button>
          <Link href={routes.prices()} className={styles.continueShopping}>
            افزودن محصول دیگر
          </Link>
        </div>
      </section>

      {/* Summary */}
      <aside className={styles.summary} aria-labelledby="cart-summary-title">
        <div className={styles.summaryCard}>
          <h2 id="cart-summary-title" className={styles.summaryTitle}>
            خلاصهٔ استعلام
          </h2>

          <dl className={styles.summaryList}>
            <div className={styles.summaryRow}>
              <dt>تعداد اقلام</dt>
              <dd className="tnum">{toPersianDigits(count)} مورد</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>وزن کل</dt>
              <dd className="tnum">
                {totalWeight > 0 ? `${toPersianDigits(Math.round(totalWeight))} کیلوگرم` : '—'}
              </dd>
            </div>
            <div className={`${styles.summaryRow} ${styles.summaryTotalRow}`}>
              <dt>برآورد کل</dt>
              <dd className={`${styles.summaryTotal} tnum`}>
                {estTotal > 0 ? formatToman(estTotal) : 'استعلامی'}
              </dd>
            </div>
          </dl>

          <p className={styles.estNote}>
            برآورد تقریبی — قیمت نهایی هنگام تأیید کارشناس
          </p>

          <Link href={routes.request()} className={styles.primaryCta} data-event="cart_to_request">
            ادامه و ثبت درخواست
            <ArrowEndIcon size={18} />
          </Link>

          <Alert tone="info" className={styles.calmNote}>
            در آهن‌تایم پرداخت آنلاین نداریم؛ کارشناس ما برای نهایی‌کردن قیمت و تحویل با شما تماس می‌گیرد.
          </Alert>
        </div>
      </aside>
    </div>
  );
}
