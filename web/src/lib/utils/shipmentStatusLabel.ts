import type { ShipmentStatus } from '@/lib/types/domain';

/** Locale-aware shipment-status label. `t` is `useTranslations('account.shipmentStatus')`.
 *  `SHIPMENT_STEPS` (domain.ts) stays the fa-only, order-defining source of truth —
 *  shared with the admin panel and server-side lead copy, which stay Persian by
 *  design; this is only for the customer-facing account UI. */
export function shipmentStatusLabel(status: ShipmentStatus, t: (key: string) => string): string {
  const map: Record<ShipmentStatus, string> = {
    registered: t('registered'),
    confirmed: t('confirmed'),
    loading: t('loading'),
    in_transit: t('inTransit'),
    delivered: t('delivered'),
  };
  return map[status];
}
