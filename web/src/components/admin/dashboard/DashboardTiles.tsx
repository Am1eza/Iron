'use client';
/** Dashboard tiles — the business at a glance, refreshed every 60s. */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import { TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

export function DashboardTiles() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminApi.stats,
    refetchInterval: 60_000,
  });

  if (isLoading) return <TableSkeleton rows={2} cols={4} />;
  if (isError || !data) return <p className={ui.muted}>آمار در دسترس نیست. صفحه را نوسازی کنید.</p>;

  const s = data.stats;
  const tiles = [
    { label: 'قیمت‌های به‌روز', value: s.freshPrices, href: routes.admin.pricing(), tone: 'good' as const },
    { label: 'قیمت‌های کهنه', value: s.stalePrices, href: routes.admin.pricing(), tone: s.stalePrices > 0 ? ('bad' as const) : undefined },
    { label: 'سرنخ‌های جدید', value: s.newLeads, href: routes.admin.leads(), tone: s.newLeads > 0 ? ('good' as const) : undefined },
    { label: 'درخواست‌های باز', value: s.openRequests, href: routes.admin.leads() },
    { label: 'سفارش‌های در جریان', value: s.activeOrders, href: routes.admin.orders() },
    { label: 'پیام‌های جدید', value: s.newMessages, href: routes.admin.leads() },
    { label: 'کاربران', value: s.totalUsers, href: routes.admin.users(), hint: `${toPersianDigits(s.newUsers24h)} کاربر تازه در ۲۴ ساعت` },
    { label: 'پیش‌نویس محتوا', value: s.draftArticles, href: routes.admin.content() },
    {
      label: 'هوش مصنوعی امروز',
      value: s.aiToday.promptTokens + s.aiToday.completionTokens,
      href: routes.admin.leads(),
      tone: s.aiToday.violations > 0 ? ('bad' as const) : undefined,
      hint: `${toPersianDigits(s.aiToday.violations)} تخطی عددی · کش ${toPersianDigits(Math.round(s.aiToday.cacheHitRate * 100))}٪`,
    },
  ];

  return (
    <div className={ui.tiles}>
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={`${ui.tile} ${t.tone === 'good' ? ui.tileGood : ''} ${t.tone === 'bad' ? ui.tileBad : ''}`}
        >
          <span className={ui.tileValue}>{toPersianDigits(t.value)}</span>
          <span className={ui.tileLabel}>{t.label}</span>
          {t.hint ? <span className={ui.tileHint}>{t.hint}</span> : null}
        </Link>
      ))}
    </div>
  );
}
