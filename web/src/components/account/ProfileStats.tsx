'use client';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useRequestsStore } from '@/lib/stores/requests';
import { getOrders } from '@/lib/mock/orders';
import { getWarehouseItems } from '@/lib/mock/warehouse';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ProfileStats.module.css';

/**
 * Profile overview tiles — live counts that deep-link into their tabs, so the
 * profile reads as the user's control room, not a settings page.
 */
export function ProfileStats() {
  const requestCount = useRequestsStore((s) => s.requests.length);
  const orders = getOrders();
  const inTransit = orders.filter((o) => o.status !== 'delivered').length;
  const warehouseCount = getWarehouseItems().length;

  const tiles = [
    {
      href: routes.account('requests'),
      value: requestCount,
      label: 'درخواست فعال',
      hint: requestCount > 0 ? 'در انتظار پیگیری کارشناس' : 'هنوز درخواستی ندارید',
    },
    {
      href: routes.account('orders'),
      value: inTransit,
      label: 'سفارش در جریان',
      hint: 'حمل و تحویل را دنبال کنید',
    },
    {
      href: routes.account('warehouse'),
      value: warehouseCount,
      label: 'کالای امانی در انبار',
      hint: 'موجودی انبار مشتریان',
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
