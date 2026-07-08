'use client';
/**
 * «میز کار من» — a sales rep's personal, scoped workspace. Shows ONLY leads
 * assigned to the signed-in staff member: quick stats, upcoming callbacks, and
 * their active queue. Backed by /api/admin/my/desk (scoped to session.id).
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminApi, type DeskLead } from '@/lib/api/resources/admin';
import { toPersianDigits, formatJalali } from '@/lib/utils/format';
import { EmptyState, Heading, TableSkeleton, Text, Badge } from '@/components/ui';
import ui from '../adminUi.module.css';

const STATUS_LABEL: Record<string, string> = {
  new: 'جدید',
  contacted: 'در تماس',
  won: 'موفق',
  lost: 'ناموفق',
};
const SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد',
  cooperation: 'همکاری',
  tool: 'ابزار',
  warehouse: 'انبار',
  contact: 'تماس',
};

function LeadRows({ rows, showCallback }: { rows: DeskLead[]; showCallback?: boolean }) {
  return (
    <table className={ui.table}>
      <thead>
        <tr>
          <th scope="col">کد</th>
          <th scope="col">مشتری</th>
          <th scope="col">منبع</th>
          <th scope="col">وضعیت</th>
          <th scope="col">{showCallback ? 'زمان تماس' : 'تاریخ'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id}>
            <td className={ui.mono}>
              <bdi>{l.ref}</bdi>
            </td>
            <td>
              {l.contactName || '—'}
              <div>
                <a href={`tel:${l.contactMobile}`} className={ui.mono} dir="ltr" style={{ color: 'var(--color-accent-text)' }}>
                  {toPersianDigits(l.contactMobile)}
                </a>
              </div>
            </td>
            <td>{SOURCE_LABEL[l.source] ?? l.source}</td>
            <td>
              <Badge tone={l.status === 'won' ? 'success' : l.status === 'lost' ? 'loss' : 'accent'}>
                {STATUS_LABEL[l.status] ?? l.status}
              </Badge>
            </td>
            <td className={ui.mono}>
              {showCallback && l.callbackAt ? formatJalali(l.callbackAt) : formatJalali(l.createdAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MyDesk() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'my', 'desk'],
    queryFn: () => adminApi.myDesk(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError || !data)
    return <EmptyState size="section" tone="error" headline="خطا در دریافت میز کار" primary={{ label: 'تلاش دوباره', onClick: () => refetch() }} />;

  const { stats, active, callbacks } = data;
  const fa = (n: number) => toPersianDigits(n);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div className={ui.tiles}>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>سرنخ‌های من</span>
          <span className={`${ui.tileValue} tnum`}>{fa(stats.assigned)}</span>
          <span className={ui.tileHint}>مجموع واگذارشده به شما</span>
        </div>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>در جریان</span>
          <span className={`${ui.tileValue} tnum`}>{fa(stats.active)}</span>
          <span className={ui.tileHint}>جدید + در تماس</span>
        </div>
        <div className={`${ui.tile} ${ui.tileGood}`}>
          <span className={ui.tileLabel}>موفق</span>
          <span className={`${ui.tileValue} tnum`}>{fa(stats.won)}</span>
          <span className={ui.tileHint}>سرنخ‌های بسته‌شده</span>
        </div>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>نرخ تبدیل</span>
          <span className={`${ui.tileValue} tnum`}>{stats.conversionPct === null ? '—' : `${fa(stats.conversionPct)}٪`}</span>
          <span className={ui.tileHint}>موفق ÷ (موفق + ناموفق)</span>
        </div>
      </div>

      <section className={ui.panel}>
        <Heading level={2}>
          تماس‌های پیش‌رو
          {callbacks.length > 0 ? <Badge tone="accent">{fa(callbacks.length)}</Badge> : null}
        </Heading>
        <Text color="muted">سرنخ‌هایی که برایشان زمان تماس ثبت کرده‌اید — به‌ترتیب نزدیک‌ترین.</Text>
        {callbacks.length === 0 ? <EmptyState size="inline" headline="تماس زمان‌بندی‌شده‌ای ندارید" /> : <LeadRows rows={callbacks} showCallback />}
      </section>

      <section className={ui.panel}>
        <Heading level={2}>سرنخ‌های در جریان من</Heading>
        <Text color="muted">
          سرنخ‌های فعال واگذارشده به شما. برای مدیریت کامل به{' '}
          <Link href="/admin/leads">سرنخ‌ها</Link> بروید.
        </Text>
        {active.length === 0 ? (
          <EmptyState size="inline" headline="سرنخ فعالی به شما واگذار نشده" body="از صفحهٔ سرنخ‌ها می‌توانید سرنخ‌ها را به خودتان اختصاص دهید." />
        ) : (
          <LeadRows rows={active} />
        )}
      </section>
    </div>
  );
}
