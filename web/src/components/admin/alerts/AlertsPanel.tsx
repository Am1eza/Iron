'use client';
/** Admin price-alerts (قیمت‌سنج) management — US-24.5. There was no admin
 *  surface for alerts before this; support could only see/pause them by
 *  going straight to the database. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

const STATUS_TABS: Array<{ id: '' | 'active' | 'triggered' | 'paused'; label: string }> = [
  { id: '', label: 'همه' },
  { id: 'active', label: 'فعال' },
  { id: 'triggered', label: 'اجراشده' },
  { id: 'paused', label: 'متوقف' },
];

const CHANNEL_LABEL: Record<string, string> = { sms: 'پیامک', telegram: 'تلگرام', whatsapp: 'واتساپ', eitaa: 'ایتا' };

export function AlertsPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | 'active' | 'triggered' | 'paused'>('active');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const { data, isLoading, isError, refetch } = useQuery({
    // Server pages this list — without the page param anything past the
    // first page was unreachable. The API reports hasMore (no total).
    queryKey: ['admin', 'alerts', status, page],
    queryFn: () => adminApi.alerts({ status: status || undefined, page }),
  });

  const setAlertStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'active' | 'paused' }) => adminApi.updateAlertStatus(id, next),
    onSuccess: () => {
      toast.success('وضعیت هشدار به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  const rows = data?.alerts ?? [];

  return (
    <div>
      <div className={ui.toolbar}>
        {STATUS_TABS.map((t) => (
          <Chip key={t.id || 'all'} selected={status === t.id} onClick={() => setStatus(t.id)}>
            {t.label}
          </Chip>
        ))}
        {data ? (
          <span className={ui.muted} style={{ marginInlineStart: 'auto' }}>
            سقف هر کاربر: {toPersianDigits(data.cap)} هشدار فعال
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری هشدارها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : rows.length === 0 ? (
        <EmptyState size="section" headline="هشداری نیست" body="در این وضعیت هیچ هشدار قیمتی ثبت نشده است." />
      ) : (
        <div className={ui.tableWrap}><table className={ui.table}>
          <caption className="visually-hidden">فهرست هشدارهای قیمت کاربران</caption>
          <thead>
            <tr>
              <th scope="col">کاربر</th>
              <th scope="col">هدف</th>
              <th scope="col">شرط</th>
              <th scope="col">کانال</th>
              <th scope="col">وضعیت</th>
              <th scope="col">تاریخ</th>
              <th scope="col">
                <span className="visually-hidden">عملیات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={`tnum ${ui.mono}`}>{a.mobile}</td>
                <td>{a.target.label ?? (a.target.type === 'sku' ? a.target.skuId : a.target.key)}</td>
                <td className="tnum">
                  {a.op === 'below' ? 'کمتر از' : 'بیشتر از'} {formatToman(a.threshold, false)} تومان
                </td>
                <td>{CHANNEL_LABEL[a.channel] ?? a.channel}</td>
                <td>
                  {a.status === 'active' ? (
                    <Badge tone="gain">فعال</Badge>
                  ) : a.status === 'triggered' ? (
                    <Badge tone="accent">اجراشده</Badge>
                  ) : (
                    <Badge tone="stale">متوقف</Badge>
                  )}
                </td>
                <td className="tnum">
                  {a.lastTriggeredAt ? formatJalali(a.lastTriggeredAt) : formatJalali(a.createdAt)}
                </td>
                <td>
                  {a.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAlertStatus.mutate({ id: a.id, next: 'paused' })}
                      loading={setAlertStatus.isPending && setAlertStatus.variables?.id === a.id}
                      disabled={setAlertStatus.isPending}
                    >
                      متوقف کن
                    </Button>
                  ) : a.status === 'paused' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAlertStatus.mutate({ id: a.id, next: 'active' })}
                      loading={setAlertStatus.isPending && setAlertStatus.variables?.id === a.id}
                      disabled={setAlertStatus.isPending}
                    >
                      فعال‌سازی مجدد
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {data && (page > 1 || data.hasMore) ? (
        <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            قبلی
          </Button>
          <span className={ui.muted}>صفحهٔ {toPersianDigits(page)}</span>
          <Button size="sm" variant="ghost" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
            بعدی
          </Button>
        </div>
      ) : null}
    </div>
  );
}
