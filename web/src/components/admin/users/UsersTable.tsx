'use client';
/** Users + roles + club tiers — RBAC management with a last-admin guard. */
import { Fragment, useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, Heading, Spinner, TableSkeleton, useConfirm } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const ROLES: Role[] = ['customer', 'operator', 'sales', 'content', 'catalog', 'admin'];
const TIER_LABEL: Record<string, string> = { iron: 'آهنی', steel: 'فولادی', poolad: 'پولادی' };
const INVITABLE_ROLES: Array<'operator' | 'sales' | 'content' | 'catalog'> = ['operator', 'sales', 'content', 'catalog'];

export function UsersTable() {
  const toast = useToast();
  const qc = useQueryClient();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState<{ mobile: string; name: string; role: (typeof INVITABLE_ROLES)[number] }>({
    mobile: '',
    name: '',
    role: 'sales',
  });

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Filter change resets to page 1 (an old page number can be past the end
  // of the new, shorter result set).
  useEffect(() => {
    setPage(1);
  }, [role, q]);

  const { data, isLoading, isError, refetch } = useQuery({
    // The server pages at 50/page — without the page param this table simply
    // could never show user #51.
    queryKey: ['admin', 'users', role, q, page],
    queryFn: () => adminApi.users({ role: role || undefined, q: q || undefined, page }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: string; isActive?: boolean } }) =>
      adminApi.updateUser(id, patch),
    onSuccess: () => {
      toast.success('کاربر به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });
  const setTier = useMutation({
    mutationFn: ({ userId, tier }: { userId: string; tier: 'iron' | 'steel' | 'poolad' }) =>
      adminApi.setClubTier(userId, tier),
    onSuccess: () => {
      toast.success('سطح باشگاه به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'تغییر سطح ناموفق بود.'),
  });
  const createStaff = useMutation({
    mutationFn: () => adminApi.createStaffUser({ mobile: invite.mobile.trim(), name: invite.name.trim() || undefined, role: invite.role }),
    onSuccess: () => {
      toast.success('کاربر ستادی ساخته شد؛ با همین موبایل و کد پیامکی وارد می‌شود.');
      setInviting(false);
      setInvite({ mobile: '', name: '', role: 'sales' });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ساخت کاربر ناموفق بود.'),
  });

  const users = data?.users ?? [];
  const { confirm, dialog } = useConfirm();

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <div>
        <div className={ui.toolbar}>
          <Chip selected={role === ''} onClick={() => setRole('')}>
            همه
          </Chip>
          {ROLES.map((r) => (
            <Chip key={r} selected={role === r} onClick={() => setRole(r)}>
              {ROLE_LABEL[r]}
            </Chip>
          ))}
          <input
            className={ui.textCell}
            style={{ inlineSize: '13rem', marginInlineStart: 'auto' }}
            placeholder="جستجو: موبایل یا نام…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="جستجوی کاربر"
          />
          <Button size="sm" variant="secondary" onClick={() => setInviting(!inviting)}>
            دعوت کاربر ستادی
          </Button>
        </div>

        {inviting ? (
          <div className={ui.panel} style={{ marginBlockEnd: 'var(--space-3)' }}>
            <div className={ui.grid2}>
              <TextInput
                label="موبایل"
                inputMode="numeric"
                dir="ltr"
                value={invite.mobile}
                onChange={(e) => setInvite({ ...invite, mobile: e.target.value })}
                helper="کاربر با همین شماره و کد پیامکی وارد می‌شود."
              />
              <TextInput label="نام (اختیاری)" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <div>
                <label className={ui.muted} htmlFor="invite-role">
                  نقش
                </label>
                <br />
                <select
                  id="invite-role"
                  className={ui.select}
                  value={invite.role}
                  onChange={(e) => setInvite({ ...invite, role: e.target.value as typeof invite.role })}
                >
                  {INVITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
              <Button size="sm" onClick={() => createStaff.mutate()} disabled={!invite.mobile.trim()} loading={createStaff.isPending}>
                ساخت کاربر
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setInviting(false)}>
                انصراف
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : isError ? (
          <EmptyState
            size="section"
            tone="error"
            headline="بارگذاری کاربران ناموفق بود."
            primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
          />
        ) : users.length === 0 ? (
          <EmptyState size="section" headline="کاربری نیست" body="با این فیلتر کاربری پیدا نشد." />
        ) : (
          <div className={ui.tableWrap}><table className={ui.table}>
            <caption className="visually-hidden">فهرست کاربران</caption>
            <thead>
              <tr>
                <th scope="col">موبایل</th>
                <th scope="col">نام</th>
                <th scope="col">نقش</th>
                <th scope="col">وضعیت</th>
                <th scope="col">عضویت</th>
                <th scope="col">
                  <span className="visually-hidden">عملیات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                <tr>
                  <td className={`tnum ${ui.mono}`}>{u.mobile}</td>
                  <td>
                    {u.name ?? '—'}{' '}
                    {u.clubTier ? (
                      <select
                        className={ui.select}
                        value={u.clubTier}
                        aria-label={`سطح باشگاه ${u.mobile}`}
                        onChange={(e) => setTier.mutate({ userId: u.id, tier: e.target.value as 'iron' | 'steel' | 'poolad' })}
                      >
                        {Object.entries(TIER_LABEL).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td>
                    {u.role === 'admin' ? (
                      // Admin role is granted/revoked ONLY via the allowlist
                      // panel («مدیران») — the server rejects it here anyway.
                      <Badge tone="success">{ROLE_LABEL.admin}</Badge>
                    ) : (
                      <select
                        className={ui.select}
                        value={u.role}
                        onChange={(e) => {
                          const nextRole = e.target.value;
                          // Role change revokes the user's existing sessions —
                          // confirm before firing (the select otherwise commits
                          // on a single stray change).
                          void confirm({
                            title: 'تغییر نقش کاربر؟',
                            body: `نقش ${u.name ?? toPersianDigits(u.mobile)} به «${ROLE_LABEL[nextRole as Role]}» تغییر می‌کند و نشست‌های فعلی او باطل می‌شود.`,
                            confirmLabel: 'تغییر نقش',
                          }).then((ok) => {
                            if (ok) update.mutate({ id: u.id, patch: { role: nextRole } });
                          });
                        }}
                        aria-label={`نقش ${u.mobile}`}
                      >
                        {ROLES.filter((r) => r !== 'admin').map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <select
                      className={ui.select}
                      value={u.isActive === false ? 'off' : 'on'}
                      onChange={(e) => {
                        const nextActive = e.target.value === 'on';
                        if (!nextActive) {
                          void confirm({
                            title: 'غیرفعال‌سازی کاربر',
                            body: `کاربر ${u.mobile} غیرفعال می‌شود و امکان ورود نخواهد داشت. ادامه؟`,
                            confirmLabel: 'غیرفعال کن',
                          }).then((ok) => {
                            if (ok) update.mutate({ id: u.id, patch: { isActive: nextActive } });
                          });
                          return;
                        }
                        update.mutate({ id: u.id, patch: { isActive: nextActive } });
                      }}
                      aria-label={`وضعیت ${u.mobile}`}
                    >
                      <option value="on">فعال</option>
                      <option value="off">غیرفعال</option>
                    </select>
                  </td>
                  <td className="tnum">{formatJalali(u.createdAt)}</td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === u.id ? null : u.id)}>
                      {openId === u.id ? 'بستن' : 'جزئیات'}
                    </Button>
                  </td>
                </tr>
                {openId === u.id ? (
                  <tr>
                    <td colSpan={6}>
                      <UserDetail id={u.id} />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
        {data ? <p className={ui.muted}>{toPersianDigits(data.total)} کاربر</p> : null}
        {data ? <PagerFooter page={page} perPage={50} total={data.total} onPage={setPage} /> : null}
      </div>

      {dialog}
    </div>
  );
}

const LEAD_STATUS_LABEL: Record<string, string> = { new: 'جدید', contacted: 'تماس‌گرفته', won: 'موفق', lost: 'ناموفق' };
const ORDER_STATUS_LABEL: Record<string, string> = {
  registered: 'ثبت‌شده',
  confirmed: 'تأییدشده',
  loading: 'بارگیری',
  in_transit: 'در حال حمل',
  delivered: 'تحویل',
};

/** Per-user detail glance — recent leads/orders + AI usage, with a
 *  session-revoke button (US-21.3). Row-expand, same pattern as LeadDetail. */
function UserDetail({ id }: { id: string }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => adminApi.userDetail(id) });

  const revoke = useMutation({
    mutationFn: () => adminApi.revokeUserSessions(id),
    onSuccess: () => toast.success('همهٔ نشست‌های این کاربر قطع شد.'),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'قطع نشست ناموفق بود.'),
  });

  if (isLoading || !data) {
    return (
      <div className={ui.panel}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className={ui.panel} onClick={(e) => e.stopPropagation()}>
      <div className={ui.grid2}>
        <div>
          <h2>سرنخ‌های اخیر</h2>
          {data.leads.length === 0 ? (
            <p className={ui.muted}>سرنخی ثبت نشده.</p>
          ) : (
            <ul>
              {data.leads.map((l) => (
                <li key={l.id} className="tnum">
                  <bdi>{l.ref}</bdi> — {LEAD_STATUS_LABEL[l.status] ?? l.status} · {formatJalali(l.createdAt)}
                </li>
              ))}
              {data.leadsHasMore ? <li className={ui.muted}>و بیشتر…</li> : null}
            </ul>
          )}
          <h2 style={{ marginBlockStart: 'var(--space-3)' }}>سفارش‌های اخیر</h2>
          {data.orders.length === 0 ? (
            <p className={ui.muted}>سفارشی ثبت نشده.</p>
          ) : (
            <ul>
              {data.orders.map((o) => (
                <li key={o.id} className="tnum">
                  <bdi>{o.ref}</bdi> — {ORDER_STATUS_LABEL[o.status] ?? o.status} · {formatJalali(o.placedAt)}
                </li>
              ))}
              {data.ordersHasMore ? <li className={ui.muted}>و بیشتر…</li> : null}
            </ul>
          )}
        </div>
        <div>
          <h2>مصرف دستیار هوشمند</h2>
          <p className="tnum">
            {toPersianDigits(data.aiUsage.conversationCount)} گفتگو ·{' '}
            {toPersianDigits((data.aiUsage.promptTokens + data.aiUsage.completionTokens).toLocaleString('en-US'))} توکن
          </p>
          <h2 style={{ marginBlockStart: 'var(--space-3)' }}>نشست‌ها</h2>
          <Button
            size="sm"
            variant="secondary"
            loading={revoke.isPending}
            onClick={() =>
              void confirm({
                title: 'قطع نشست کاربر',
                body: 'همهٔ نشست‌های فعال این کاربر بلافاصله قطع می‌شود و باید دوباره وارد شود. ادامه؟',
                confirmLabel: 'قطع کن',
              }).then((ok) => {
                if (ok) revoke.mutate();
              })
            }
          >
            قطع همهٔ نشست‌ها
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  );
}

