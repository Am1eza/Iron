'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './admin.module.css';

export type NavGroup = {
  /** null title = ungrouped top items (dashboard, my desk). */
  title: string | null;
  items: Array<{ href: string; label: string; badge?: 'inbound' }>;
};

/**
 * Grouped admin nav — desktop renders a vertical sidebar (grouped, with
 * pending-work badges); mobile renders one horizontally-scrollable pill strip
 * (never a multi-row wall of links). Badge counts ride the SAME
 * ['admin','stats'] query AdminAlerts already polls every 20s — zero extra
 * requests, and the numbers update live while you work.
 */
export function AdminNavLinks({ groups, variant }: { groups: NavGroup[]; variant: 'side' | 'strip' }) {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.stats(),
    refetchInterval: 20_000,
  });
  const s = data?.stats;
  const badgeCount = (kind?: 'inbound'): number => {
    if (!kind || !s) return 0;
    // Everything that lands on the leads page's three tabs: fresh leads,
    // unhandled contact messages, open (un-quoted) requests.
    return (s.newLeads ?? 0) + (s.newMessages ?? 0) + (s.openRequests ?? 0);
  };

  const renderItem = (item: { href: string; label: string; badge?: 'inbound' }) => {
    const active =
      item.href === '/admin'
        ? pathname === '/admin'
        : pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
    const count = badgeCount(item.badge);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={variant === 'side' ? styles.sideLink : styles.navLink}
        aria-current={active ? 'page' : undefined}
      >
        <span className={styles.navLabel}>{item.label}</span>
        {count > 0 ? (
          <span className={`${styles.navBadge} tnum`} aria-label={`${toPersianDigits(count)} مورد در انتظار`}>
            {toPersianDigits(count)}
          </span>
        ) : null}
      </Link>
    );
  };

  if (variant === 'strip') {
    return <>{groups.flatMap((g) => g.items.map(renderItem))}</>;
  }

  return (
    <>
      {groups.map((g, i) => (
        <div key={g.title ?? `g${i}`} className={styles.sideGroup}>
          {g.title ? <p className={styles.sideGroupTitle}>{g.title}</p> : null}
          {g.items.map(renderItem)}
        </div>
      ))}
    </>
  );
}
