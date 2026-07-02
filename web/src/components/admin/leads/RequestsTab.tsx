'use client';
/** User-request inbox — advance each request along its 4-step trail. */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { EmptyState, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

const TYPE_LABEL: Record<string, string> = {
  proforma: 'پیش‌فاکتور',
  bulk: 'خرید عمده',
  warehouse: 'انبار مشتریان',
};

const STATUSES = [
  { value: 'submitted', label: 'ثبت شد' },
  { value: 'reviewing', label: 'در حال بررسی' },
  { value: 'contacted', label: 'تماس کارشناس' },
  { value: 'quoted', label: 'پیش‌فاکتور صادر شد' },
];

export function RequestsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'requests'],
    queryFn: () => adminApi.requests(),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminApi.updateRequest(id, status),
    onSuccess: () => {
      toast.success('وضعیت درخواست به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'requests'] });
    },
    onError: () => toast.error('به‌روزرسانی ناموفق بود.'),
  });

  const requests = data?.requests ?? [];

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : requests.length === 0 ? (
        <EmptyState size="section" headline="درخواستی نیست" body="درخواست‌های کاربران اینجا می‌آید." />
      ) : (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>شماره</th>
              <th>نوع</th>
              <th>عنوان</th>
              <th>تاریخ</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="tnum">
                  <bdi>{r.ref}</bdi>
                </td>
                <td>{TYPE_LABEL[r.type] ?? r.type}</td>
                <td>
                  {r.title}
                  {r.detail ? <div className={ui.muted}>{r.detail}</div> : null}
                </td>
                <td className="tnum">{formatJalali(r.createdAt)}</td>
                <td>
                  <select
                    className={ui.select}
                    value={r.status}
                    onChange={(e) => update.mutate({ id: r.id, status: e.target.value })}
                    aria-label={`وضعیت ${r.ref}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} درخواست</p> : null}
    </div>
  );
}
