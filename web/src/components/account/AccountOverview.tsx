import Link from 'next/link';
import { routes } from '@/lib/routes';
import type { Order } from '@/lib/types/domain';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import { formatJalali } from '@/lib/utils/format';
import { Badge } from '@/components/ui';
import { ShieldIcon, StarIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { ProfileStats } from './ProfileStats';
import { OrderTimeline } from './OrderTimeline';
import styles from './AccountOverview.module.css';

export type OverviewNudge = {
  key: 'verify' | 'club';
  title: string;
  body: string;
  href: string;
  cta: string;
};

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
                  <span className={styles.nudgeTitle}>{n.title}</span>
                  <span className={styles.nudgeBody}>{n.body}</span>
                </span>
                <span className={styles.nudgeCta}>
                  {n.cta}
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
                آخرین سفارش
              </h3>
              <p className={styles.lastOrderMeta}>
                <bdi className="tnum">{lastOrder.ref}</bdi> · {formatJalali(lastOrder.placedAt)}
              </p>
            </div>
            <Badge tone={lastOrder.status === 'delivered' ? 'gain' : 'accent'}>
              {SHIPMENT_STEPS.find((s) => s.key === lastOrder.status)?.label ?? ''}
            </Badge>
          </div>
          <OrderTimeline status={lastOrder.status} />
          <Link href={routes.account('orders')} className={styles.allLink}>
            همهٔ سفارش‌ها
            <ChevronStartIcon size={14} className="icon--rtl" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
