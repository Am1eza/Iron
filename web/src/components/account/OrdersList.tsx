import type { Order } from '@/lib/types/domain';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { Badge, EmptyState } from '@/components/ui';
import { routes } from '@/lib/routes';
import { OrderTimeline } from './OrderTimeline';
import { ReorderButton } from './ReorderButton';
import styles from './OrdersList.module.css';

/**
 * «سفارش‌های من» — one flat row per order: ref + dates, live status badge,
 * shipment timeline, one-click reorder. Replaces the former inline-styled
 * card-in-card markup that lived in the account page itself.
 */
export function OrdersList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        size="section"
        headline="هنوز سفارشی ندارید"
        body="بعد از نهایی‌شدن پیش‌فاکتور، سفارش شما اینجا ساخته می‌شود و حمل آن را لحظه‌ای دنبال می‌کنید."
        primary={{ label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() }}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {orders.map((o) => {
        const label = SHIPMENT_STEPS.find((s) => s.key === o.status)?.label ?? '';
        return (
          <li key={o.ref} className={styles.item}>
            <div className={styles.top}>
              <div>
                <span className={styles.ref}>
                  سفارش <bdi className="tnum">{o.ref}</bdi>
                </span>
                <span className={styles.dates}>
                  ثبت: {formatJalali(o.placedAt)} · به‌روزرسانی: {formatJalali(o.lastUpdate)}
                </span>
              </div>
              <Badge tone={o.status === 'delivered' ? 'gain' : 'accent'}>{label}</Badge>
            </div>
            <OrderTimeline status={o.status} />
            <div className={styles.foot}>
              <span className={styles.items}>
                {o.items.map((it) => it.name).join('، ')} ({toPersianDigits(o.items.length)} ردیف)
              </span>
              <ReorderButton items={o.items} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
