'use client';
import { useTranslations, useLocale } from 'next-intl';
import type { Order } from '@/lib/types/domain';
import { localizeDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { shipmentStatusLabel } from '@/lib/utils/shipmentStatusLabel';
import { Badge, EmptyState } from '@/components/ui';
import { routes } from '@/lib/routes';
import { OrderTimeline } from './OrderTimeline';
import { ReorderButton } from './ReorderButton';
import styles from './OrdersList.module.css';

/**
 * «سفارش‌های من» — one flat row per order: ref + dates, live status badge,
 * shipment timeline, one-click reorder. Replaces the former inline-styled
 * card-in-card markup that lived in the account page itself.
 *
 * `o.items[].name` is a snapshot of the order's line-item name at purchase
 * time (no live category/sub-category reference to recompose a translated
 * name from), so it stays as originally recorded — a historical record, like
 * the rest of an invoice, rather than a live catalog display.
 */
export function OrdersList({ orders }: { orders: Order[] }) {
  const t = useTranslations('account.orders');
  const tShipment = useTranslations('account.shipmentStatus');
  const locale = useLocale();

  if (orders.length === 0) {
    return (
      <EmptyState
        size="section"
        headline={t('empty.headline')}
        body={t('empty.body')}
        primary={{ label: t('empty.cta'), href: routes.prices() }}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {orders.map((o) => {
        const label = shipmentStatusLabel(o.status, tShipment);
        return (
          <li key={o.ref} className={styles.item}>
            <div className={styles.top}>
              <div>
                <span className={styles.ref}>
                  {t('refPrefix')} <bdi className="tnum">{o.ref}</bdi>
                </span>
                <span className={styles.dates}>
                  {t('placed', { date: formatJalali(o.placedAt) })} · {t('updated', { date: formatJalali(o.lastUpdate) })}
                </span>
              </div>
              {/* Cancelled overrides the shipment badge entirely — showing
                  both "cancelled" AND a frozen shipment-stage badge side by
                  side read as contradictory status at a glance. */}
              <Badge tone={o.cancelled ? 'loss' : o.status === 'delivered' ? 'gain' : 'accent'}>
                {o.cancelled ? tShipment('cancelledBadge') : label}
              </Badge>
            </div>
            <OrderTimeline events={o.events} status={o.status} cancelled={o.cancelled} />
            {!o.cancelled && (o.trackingNumber || o.carrierName) ? (
              <p className={styles.shipping}>
                <span className={styles.shippingLabel}>
                  {t('shippingWith', { carrier: o.carrierName || t('defaultCarrier') })}
                </span>
                {o.trackingNumber ? (
                  <bdi className="tnum" dir="ltr">
                    {t('trackingCode', { code: o.trackingNumber })}
                  </bdi>
                ) : null}
              </p>
            ) : null}
            <div className={styles.foot}>
              <span className={styles.items}>
                {o.items.map((it) => it.name).join('، ')} {t('itemsCount', { count: localizeDigits(o.items.length, locale) })}
              </span>
              <ReorderButton items={o.items} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
