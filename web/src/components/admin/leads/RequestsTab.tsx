'use client';
/** User-request inbox — advance each request along its 4-step trail. */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, EmptyState, TableSkeleton, Text, useConfirm } from '@/components/ui';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const PER_PAGE = 30;

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

const STATUS_LABEL = new Map(STATUSES.map((s) => [s.value, s.label] as const));

export function RequestsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'requests', page],
    queryFn: () => adminApi.requests({ page, perPage: PER_PAGE }),
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

  // This row is what the customer reads in «درخواست‌های من» — and since
  // issuing a proforma now writes it to «پیش‌فاکتور صادر شد» itself, a bare
  // <select> was one stray click away from telling a quoted customer they are
  // back «در حال بررسی». Confirm every move, and name the damage on the one
  // move that contradicts an issued document.
  const changeStatus = async (r: { id: string; ref: string; status: string; leadId: string | null }, next: string) => {
    if (next === r.status) return;
    const undoesQuote = r.status === 'quoted' && next !== 'quoted';
    const ok = await confirm({
      title: 'تغییر وضعیت درخواست',
      body: (
        <>
          <p>
            وضعیت درخواست <bdi>{r.ref}</bdi> از «{STATUS_LABEL.get(r.status) ?? r.status}» به «
            {STATUS_LABEL.get(next) ?? next}» تغییر کند؟ مشتری همین وضعیت را در پنل خود می‌بیند.
          </p>
          {undoesQuote ? (
            <p style={{ color: 'var(--color-loss-text)' }}>
              این وضعیت هنگام صدور پیش‌فاکتور به‌صورت خودکار ثبت شده است؛ با عقب بردن آن، پنل مشتری با پیش‌فاکتوری که
              برایش صادر شده ناهماهنگ می‌شود.
            </p>
          ) : null}
        </>
      ),
      confirmLabel: 'تغییر وضعیت',
    });
    if (ok) update.mutate({ id: r.id, status: next });
  };

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      {isLoading ? (
        <TableSkeleton rows={5} cols={6} label="در حال بارگذاری درخواست‌ها" />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری درخواست‌ها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : requests.length === 0 ? (
        <EmptyState size="section" headline="درخواستی نیست" body="درخواست‌های کاربران اینجا می‌آید." />
      ) : (
        <>
          <Text variant="caption" color="muted">
            «پیش‌فاکتور صادر شد» با صدور پیش‌فاکتور در سرنخِ همان درخواست، خودکار ثبت می‌شود — معمولاً لازم نیست دستی
            تغییرش دهید.
          </Text>
          <div className={ui.tableWrap}><table className={ui.table}>
          <caption className="visually-hidden">فهرست درخواست‌های کاربران</caption>
          <thead>
            <tr>
              <th scope="col">شماره</th>
              <th scope="col">نوع</th>
              <th scope="col">عنوان</th>
              <th scope="col">سرنخ</th>
              <th scope="col">تاریخ</th>
              <th scope="col">وضعیت</th>
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
                {/* The stage is driven from the lead (proforma issuance writes
                    it), so the lead has to be one click away — the rep used to
                    have to search the ref by hand in the other tab. */}
                <td>
                  {r.leadId ? (
                    <Link
                      href={`/admin/leads/${encodeURIComponent(r.leadId)}`}
                      style={{ color: 'var(--color-accent-text)' }}
                      aria-label={`سرنخ درخواست ${r.ref}`}
                    >
                      باز کردن سرنخ
                    </Link>
                  ) : (
                    <span className={ui.muted}>—</span>
                  )}
                </td>
                <td className="tnum">{formatJalali(r.createdAt)}</td>
                <td>
                  <select
                    className={ui.select}
                    value={r.status}
                    onChange={(e) => void changeStatus(r, e.target.value)}
                    disabled={update.isPending && update.variables?.id === r.id}
                    aria-label={`وضعیت ${r.ref}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {/* Only a request that HAS a lead can have been advanced by
                      the proforma route (it matches on leadId) — a quoted
                      request without one was necessarily set by hand, so it
                      must not claim to be automatic. */}
                  {r.status === 'quoted' && r.leadId ? (
                    <div
                      style={{ marginBlockStart: 'var(--space-1)' }}
                      title="با صدور پیش‌فاکتور برای این سرنخ تنظیم می‌شود."
                    >
                      <Badge tone="info">خودکار از پیش‌فاکتور</Badge>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          </table></div>
        </>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} درخواست</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
      {dialog}
    </div>
  );
}
