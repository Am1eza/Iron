import Link from 'next/link';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ProfileStats.module.css';

/**
 * Profile overview tiles — REAL per-user counts (open requests, in-transit
 * orders, stored consignments) that deep-link into their tabs, so the profile
 * reads as the user's control room. Server component fed by getProfileCounts()
 * (was a client component importing @/lib/mock directly, which shipped demo
 * numbers to production).
 */
export function ProfileStats({
  openRequests,
  activeOrders,
  warehouseItems,
}: {
  openRequests: number;
  activeOrders: number;
  warehouseItems: number;
}) {
  const tiles = [
    {
      href: routes.account('requests'),
      value: openRequests,
      label: 'درخواست فعال',
      hint: openRequests > 0 ? 'در انتظار پیگیری کارشناس' : 'هنوز درخواستی ندارید',
    },
    {
      href: routes.account('orders'),
      value: activeOrders,
      label: 'سفارش در جریان',
      hint: activeOrders > 0 ? 'حمل و تحویل را دنبال کنید' : 'سفارش فعالی ندارید',
    },
    {
      href: routes.account('warehouse'),
      value: warehouseItems,
      label: 'کالای امانی در انبار',
      hint: warehouseItems > 0 ? 'موجودی انبار مشتریان' : 'کالای امانی ندارید',
    },
  ];

  return (
    <ul className={styles.grid}>
      {tiles.map((t) => (
        <li key={t.label}>
          <Link href={t.href} className={styles.tile}>
            <span className={`${styles.value} tnum`}>{toPersianDigits(t.value)}</span>
            <span className={styles.label}>{t.label}</span>
            <span className={styles.hint}>{t.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
