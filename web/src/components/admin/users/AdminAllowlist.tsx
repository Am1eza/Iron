'use client';
/**
 * «مدیران» — the admin allowlist manager. The single place the admin role is
 * granted or revoked: adding a mobile promotes it (on the spot if the account
 * exists, otherwise on their first OTP login); removing demotes immediately
 * and kills their sessions. Server enforces: no self-removal, no removing the
 * last admin, every change audited.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import ui from '../adminUi.module.css';

export function AdminAllowlist({ selfMobile }: { selfMobile: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'allowlist'],
    queryFn: () => adminApi.allowlist(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'allowlist'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const add = useMutation({
    mutationFn: () => adminApi.addToAllowlist(mobile.trim(), label.trim() || undefined),
    onSuccess: () => {
      toast.success('شماره به فهرست مدیران اضافه شد.');
      setMobile('');
      setLabel('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'افزودن ناموفق بود.'),
  });

  const remove = useMutation({
    mutationFn: (m: string) => adminApi.removeFromAllowlist(m),
    onSuccess: () => {
      toast.success('شماره از فهرست مدیران حذف شد؛ نشست‌هایش باطل شد.');
      setConfirming(null);
      invalidate();
    },
    onError: (err) => {
      setConfirming(null);
      toast.error(err instanceof ApiError ? err.message : 'حذف ناموفق بود.');
    },
  });

  const entries = data?.entries ?? [];

  return (
    <section className={ui.panel} aria-labelledby="allowlist-heading">
      <Heading level={2} id="allowlist-heading">
        مدیران (فهرست مجاز)
      </Heading>
      <Text color="muted">
        فقط شماره‌های این فهرست می‌توانند با ورود OTP نقش «مدیر سیستم» بگیرند. حذف یک شماره،
        دسترسی و نشست‌های آن را بلافاصله باطل می‌کند.
      </Text>

      <form
        className={ui.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          if (!add.isPending && mobile.trim()) add.mutate();
        }}
      >
        <label htmlFor="allowlist-mobile" className="visually-hidden">
          شمارهٔ موبایل مدیر جدید
        </label>
        <input
          id="allowlist-mobile"
          className={ui.textCell}
          style={{ inlineSize: '11rem', direction: 'ltr', textAlign: 'end' }}
          placeholder="۰۹xxxxxxxxx"
          value={mobile}
          inputMode="tel"
          maxLength={11}
          onChange={(e) => setMobile(e.target.value)}
        />
        <label htmlFor="allowlist-label" className="visually-hidden">
          برچسب (اختیاری)
        </label>
        <input
          id="allowlist-label"
          className={ui.textCell}
          style={{ inlineSize: '12rem' }}
          placeholder="برچسب (مثلاً: مدیر فروش)"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className={ui.primaryBtn ?? undefined} disabled={add.isPending || !mobile.trim()}>
          {add.isPending ? 'در حال افزودن…' : 'افزودن مدیر'}
        </button>
      </form>

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="خطا در دریافت فهرست"
          primary={{ label: 'تلاش دوباره', onClick: () => refetch() }}
        />
      ) : entries.length === 0 ? (
        <EmptyState size="section" headline="فهرست خالی است" body="با فرم بالا اولین مدیر را اضافه کنید." />
      ) : (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>موبایل</th>
              <th>برچسب</th>
              <th>وضعیت حساب</th>
              <th>تاریخ افزودن</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isSelf = e.mobile === selfMobile;
              return (
                <tr key={e.mobile}>
                  <td className={ui.mono}>{toPersianDigits(e.mobile)}</td>
                  <td>{e.label ?? '—'}</td>
                  <td>
                    {e.userId ? (
                      <Badge tone={e.userRole === 'admin' ? 'success' : 'stale'}>
                        {e.userRole === 'admin' ? `فعال${e.userName ? ` — ${e.userName}` : ''}` : 'در انتظار ورود بعدی'}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">هنوز وارد نشده</Badge>
                    )}
                  </td>
                  <td className={ui.muted}>{formatJalali(e.createdAt)}</td>
                  <td>
                    {isSelf ? (
                      <span className={ui.muted}>شما</span>
                    ) : confirming === e.mobile ? (
                      <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          onClick={() => remove.mutate(e.mobile)}
                          disabled={remove.isPending}
                          style={{ color: 'var(--color-danger, #b91c1c)' }}
                        >
                          {remove.isPending ? 'در حال حذف…' : 'تأیید حذف'}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)}>
                          انصراف
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirming(e.mobile)}>
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
