'use client';
/**
 * «پیش‌فاکتورها» — the proforma register. Every issued proforma across all
 * leads in one place: who it went to, its total, when it expires, and a jump
 * into the source lead. Previously proformas were only visible one lead at a
 * time inside the CRM row expansion — nothing showed what's outstanding or
 * about to expire.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali, formatToman, toPersianDigits } from '@/lib/utils/format';
import { Badge, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const PER_PAGE = 30;

const STATUS_CHIPS: Array<{ id: '' | 'active' | 'expired' | 'cancelled'; label: string }> = [
  { id: '', label: 'همه' },
  { id: 'active', label: 'فعال' },
  { id: 'expired', label: 'منقضی' },
  { id: 'cancelled', label: 'لغوشده' },
];

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: 'جدید',
  contacted: 'در پیگیری',
  won: 'موفق',
  lost: 'ناموفق',
};

export function ProformasTab() {
  const [status, setStatus] = useState<'' | 'active' | 'expired' | 'cancelled'>('active');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'proformas', status, page],
    queryFn: () => adminApi.proformas({ status: status || undefined, page }),
  });
  const rows = data?.proformas ?? [];

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      <div className={ui.toolbar}>
        {STATUS_CHIPS.map((c) => (
          <Chip key={c.id || 'all'} selected={status === c.id} onClick={() => setStatus(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری پیش‌فاکتورها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="section"
          headline="پیش‌فاکتوری نیست"
          body="پیش‌فاکتورها از داخل سرنخ («صدور پیش‌فاکتور») صادر می‌شوند."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <caption className="visually-hidden">دفتر پیش‌فاکتورها</caption>
            <thead>
              <tr>
                <th scope="col">شماره</th>
                <th scope="col">مشتری</th>
                <th scope="col">مبلغ</th>
                <th scope="col">اعتبار تا</th>
                <th scope="col">وضعیت</th>
                <th scope="col">سرنخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="tnum">
                    <bdi>{p.ref}</bdi>
                    <div className={`${ui.muted} tnum`}>{formatJalali(p.createdAt)}</div>
                  </td>
                  <td>
                    {p.contactName ?? '—'}
                    <div className={`${ui.muted} tnum`}>{toPersianDigits(p.contactMobile)}</div>
                  </td>
                  <td className="tnum">
                    {formatToman(p.total, false)} تومان
                    {p.discountToman > 0 ? (
                      <div className={`${ui.muted} tnum`}>تخفیف: {formatToman(p.discountToman, false)}</div>
                    ) : null}
                  </td>
                  <td className="tnum">{formatJalali(p.validUntil)}</td>
                  <td>
                    <Badge tone={p.status === 'active' ? 'gain' : p.status === 'expired' ? 'stale' : 'loss'}>
                      {p.status === 'active' ? 'فعال' : p.status === 'expired' ? 'منقضی' : 'لغوشده'}
                    </Badge>
                  </td>
                  <td>
                    <Link href={`/admin/leads/${encodeURIComponent(p.leadId)}`} style={{ color: 'var(--color-accent-text)' }}>
                      <bdi>{p.leadRef}</bdi>
                    </Link>
                    <div className={ui.muted}>{LEAD_STATUS_LABEL[p.leadStatus] ?? p.leadStatus}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} پیش‌فاکتور</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}
