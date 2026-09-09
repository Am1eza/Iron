'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import type { Order } from '@/lib/types/domain';
import { shipmentStatusLabel } from '@/lib/utils/shipmentStatusLabel';
import { formatJalali } from '@/lib/utils/jalali';
import { Badge } from '@/components/ui';
import { ShieldIcon, StarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { ProfileStats } from './ProfileStats';
import { OrderTimeline } from './OrderTimeline';
import styles from './AccountOverview.module.css';

export type OverviewNudge =
  | { key: 'verify'; href: string; level: number }
  | { key: 'club'; href: string };

/**
 * «نمای کلی» — the account landing. Glanceable by design (dashboard-UX
 * research: KPIs + next-best actions in one screenful, drill-down on demand):
 * three deep-linking count tiles, at most two "next step" nudges, and the
 * latest order's live shipment state. Everything links deeper; nothing here
 * is a form.
 */
export function AccountOverview({
  counts,
  nudges,
  lastOrder,
}: {
  counts: { openRequests: number; activeOrders: number; warehouseItems: number };
  nudges: OverviewNudge[];
  lastOrder: Order | null;
}) {
  const t = useTranslations('account.overview');
  const tShipment = useTranslations('account.shipmentStatus');

  return (
    <div className={styles.wrap}>
      <ProfileStats
        openRequests={counts.openRequests}
        activeOrders={counts.activeOrders}
        warehouseItems={counts.warehouseItems}
      />

      {nudges.length > 0 ? (
        <ul className={styles.nudges}>
          {nudges.map((n) => (
            <li key={n.key}>
              <Link href={n.href} className={styles.nudge}>
                <span className={styles.nudgeIcon} aria-hidden="true">
                  {n.key === 'verify' ? <ShieldIcon size={18} /> : <StarIcon size={18} />}
                </span>
                <span className={styles.nudgeText}>
                  <span className={styles.nudgeTitle}>
                    {n.key === 'verify' ? t('verifyNudgeTitle') : t('clubNudgeTitle')}
                  </span>
                  <span className={styles.nudgeBody}>
                    {n.key === 'verify' ? t('verifyNudgeBody', { level: n.level }) : t('clubNudgeBody')}
                  </span>
                </span>
                <span className={styles.nudgeCta}>
                  {n.key === 'verify' ? t('verifyNudgeCta') : t('clubNudgeCta')}
                  <ChevronStartIcon size={14} className="icon--rtl" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {lastOrder ? (
        <section className={styles.lastOrder} aria-labelledby="last-order-title">
          <div className={styles.lastOrderHead}>
            <div>
              <h3 id="last-order-title" className={styles.lastOrderTitle}>
                {t('lastOrderTitle')}
              </h3>
              <p className={styles.lastOrderMeta}>
                <bdi className="tnum">{lastOrder.ref}</bdi> · {formatJalali(lastOrder.placedAt)}
              </p>
            </div>
            <Badge tone={lastOrder.cancelled ? 'loss' : lastOrder.status === 'delivered' ? 'gain' : 'accent'}>
              {lastOrder.cancelled ? tShipment('cancelledBadge') : shipmentStatusLabel(lastOrder.status, tShipment)}
            </Badge>
          </div>
          <OrderTimeline status={lastOrder.status} cancelled={lastOrder.cancelled} />
          <Link href={routes.account('orders')} className={styles.allLink}>
            {t('allOrders')}
            <ChevronStartIcon size={14} className="icon--rtl" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
