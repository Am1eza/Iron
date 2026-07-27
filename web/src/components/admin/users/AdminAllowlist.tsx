'use client';
/**
 * «دسترسی پنل» — the staff access registry. THE single place panel access is
 * granted, re-roled, or revoked: adding a mobile grants the chosen role (on
 * the spot if the account exists, otherwise at their first login); changing
 * the role applies immediately and ends their current session so the new
 * permissions load clean; removing strips the staff role at once.
 *
 * A number that isn't here cannot even request a panel login code — the OTP
 * endpoint refuses it on the panel host, so strangers can neither enter nor
 * burn SMS credit probing the login form.
 *
 * Server enforces: no self-removal, no removing the last admin, every change
 * audited.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';
import { Badge, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import { Button } from '@/components/primitives/Button';
import ui from '../adminUi.module.css';

/** Grantable roles, ordered narrowest → widest so «مدیر سیستم» is a decision,
 *  not the first thing under the cursor. */
const GRANTABLE: Role[] = ['sales', 'operator', 'content', 'catalog', 'admin'];

/** What each role may actually do — shown next to the picker so access is
 *  granted deliberately instead of by guessing at a label. */
const ROLE_SCOPE: Record<string, string> = {
  sales: 'سرنخ‌ها، سفارش‌ها، پیش‌فاکتور',
  operator: 'قیمت‌گذاری، بازار، هشدارها',
  content: 'مقاله‌ها و انتشار محتوا، سئو',
  catalog: 'دسته‌بندی‌ها و کالاها',
  admin: 'همه‌چیز، شامل کاربران، تنظیمات و گزارش فعالیت',
};

export function AdminAllowlist({ selfMobile }: { selfMobile: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<Role>('sales');
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
    mutationFn: () => adminApi.addToAllowlist(mobile.trim(), role, label.trim() || undefined),
    onSuccess: () => {
      toast.success('دسترسی پنل برای این شماره صادر شد.');
      setMobile('');
      setLabel('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'افزودن ناموفق بود.'),
  });

  // Re-roling is the same upsert as adding — the row's mobile is its identity.
  const changeRole = useMutation({
    mutationFn: (v: { mobile: string; role: Role; label: string | null }) =>
      adminApi.addToAllowlist(v.mobile, v.role, v.label ?? undefined),
    onSuccess: () => {
      toast.success('نقش تغییر کرد؛ نشست فعلی این کاربر برای اعمال دسترسی جدید بسته شد.');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'تغییر نقش ناموفق بود.'),
  });

  const remove = useMutation({
    mutationFn: (m: string) => adminApi.removeFromAllowlist(m),
    onSuccess: () => {
      toast.success('دسترسی پنل این شماره لغو شد؛ نشست‌هایش باطل شد.');
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
        دسترسی پنل
      </Heading>
      <Text color="muted">
        فقط شماره‌های این فهرست می‌توانند وارد پنل شوند — شمارهٔ خارج از فهرست حتی کد ورود هم دریافت نمی‌کند.
        نقش هر شماره تعیین می‌کند به کدام بخش‌ها دسترسی دارد. تغییر نقش یا حذف، بلافاصله اعمال و نشست فعال بسته می‌شود.
      </Text>

      <form
        className={ui.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          if (!add.isPending && mobile.trim()) add.mutate();
        }}
      >
        <label htmlFor="allowlist-mobile" className="visually-hidden">
          شمارهٔ موبایل
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
        <label htmlFor="allowlist-role" className="visually-hidden">
          نقش
        </label>
        <select
          id="allowlist-role"
          className={ui.textCell}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {GRANTABLE.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <label htmlFor="allowlist-label" className="visually-hidden">
          برچسب (اختیاری)
        </label>
        <input
          id="allowlist-label"
          className={ui.textCell}
          style={{ inlineSize: '12rem' }}
          placeholder="نام یا توضیح (اختیاری)"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit" size="sm" loading={add.isPending} disabled={!mobile.trim()}>
          صدور دسترسی
        </Button>
        <span className={ui.muted}>{ROLE_SCOPE[role]}</span>
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
        <EmptyState size="section" headline="فهرست خالی است" body="با فرم بالا اولین دسترسی را صادر کنید." />
      ) : (
        <div className={ui.tableWrap}><table className={ui.table}>
          <caption className="visually-hidden">فهرست دسترسی‌های پنل</caption>
          <thead>
            <tr>
              <th scope="col">موبایل</th>
              <th scope="col">نام / برچسب</th>
              <th scope="col">نقش</th>
              <th scope="col">وضعیت حساب</th>
              <th scope="col">تاریخ صدور</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isSelf = e.mobile === selfMobile;
              // The row's role is the GRANT; userRole is what the account
              // actually holds right now. They differ until the user's next
              // login, which is exactly what «در انتظار ورود بعدی» means.
              const applied = e.userRole === e.role;
              return (
                <tr key={e.mobile}>
                  <td className={ui.mono}>{toPersianDigits(e.mobile)}</td>
                  <td>{e.label ?? e.userName ?? '—'}</td>
                  <td>
                    <select
                      className={ui.textCell}
                      aria-label={`نقش ${e.mobile}`}
                      value={e.role}
                      disabled={isSelf || changeRole.isPending}
                      onChange={(ev) =>
                        changeRole.mutate({ mobile: e.mobile, role: ev.target.value as Role, label: e.label })
                      }
                    >
                      {GRANTABLE.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {e.userId ? (
                      <Badge tone={applied ? 'success' : 'stale'}>
                        {applied ? `فعال${e.userName ? ` — ${e.userName}` : ''}` : 'در انتظار ورود بعدی'}
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
                      <span className={ui.rowActions}>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={remove.isPending}
                          onClick={() => remove.mutate(e.mobile)}
                        >
                          تأیید لغو دسترسی
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          انصراف
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(e.mobile)}>
                        لغو دسترسی
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
