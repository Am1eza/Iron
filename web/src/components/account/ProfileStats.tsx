'use client';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { localizeDigits } from '@/lib/utils/format';
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
  const t = useTranslations('account.profileStats');
  const locale = useLocale();
  const tiles = [
    {
      href: routes.account('requests'),
      value: openRequests,
      label: t('openRequestsLabel'),
      hint: openRequests > 0 ? t('openRequestsHintHas') : t('openRequestsHintEmpty'),
    },
    {
      href: routes.account('orders'),
      value: activeOrders,
      label: t('activeOrdersLabel'),
      hint: activeOrders > 0 ? t('activeOrdersHintHas') : t('activeOrdersHintEmpty'),
    },
    {
      href: routes.account('warehouse'),
      value: warehouseItems,
      label: t('warehouseItemsLabel'),
      hint: warehouseItems > 0 ? t('warehouseItemsHintHas') : t('warehouseItemsHintEmpty'),
    },
  ];

  return (
    <ul className={styles.grid}>
      {tiles.map((tile) => (
        <li key={tile.label}>
          <Link href={tile.href} className={styles.tile}>
            <span className={`${styles.value} tnum`}>{localizeDigits(tile.value, locale)}</span>
            <span className={styles.label}>{tile.label}</span>
            <span className={styles.hint}>{tile.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
