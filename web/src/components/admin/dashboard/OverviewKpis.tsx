'use client';
/** Management KPI row — complete-period deltas + 30-day sparklines on top of
 *  the operational tiles. Requires leads:read (hidden for scoped roles that
 *  lack it — the API omits nothing partially; it 404s, so we just hide). */
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits, formatToman } from '@/lib/utils/format';
import { KpiCard } from './KpiCard';
import styles from './dashboard.module.css';

/** Management KPIs in a bento grid — size encodes importance: proforma VALUE is
 *  the hero (2×2), leads is wide, the rest are 1×1. Complete-period deltas +
 *  30-day sparklines. Hidden for scoped roles (statsOverview 404s → null). */
export function OverviewKpis() {
  const { data, isError } = useQuery({
    queryKey: ['admin', 'stats', 'overview'],
    queryFn: () => adminApi.statsOverview(),
    refetchInterval: 120_000,
    retry: false,
  });
  if (isError || !data) return null;

  return (
    <div className={styles.bento}>
      <KpiCard
        className={styles.hero}
        label="ارزش پیش‌فاکتورها (۷ روز)"
        value={data.proformas.valueCurrent}
        deltaPct={data.proformas.valueDeltaPct}
        series={data.proformas.series}
        format={(n) => formatToman(n)}
        hint={`${toPersianDigits(data.proformas.current)} پیش‌فاکتور در ۷ روز`}
      />
      <KpiCard
        className={styles.wide}
        label="سرنخ‌های جدید"
        value={data.leads.current}
        deltaPct={data.leads.deltaPct}
        today={data.leads.today}
        series={data.leads.series}
      />
      <KpiCard label="سفارش‌ها" value={data.orders.current} deltaPct={data.orders.deltaPct} today={data.orders.today} series={data.orders.series} />
      <KpiCard label="کاربران جدید" value={data.newUsers.current} deltaPct={data.newUsers.deltaPct} today={data.newUsers.today} series={data.newUsers.series} />
      <KpiCard
        className={styles.wide}
        label="گفتگوهای مشاور هوشمند"
        value={data.aiConversations.current}
        deltaPct={data.aiConversations.deltaPct}
        today={data.aiConversations.today}
        series={data.aiConversations.series}
      />
    </div>
  );
}
