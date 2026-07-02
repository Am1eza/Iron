'use client';
/** Users + roles + club tiers — RBAC management with a last-admin guard. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Chip, EmptyState, Heading, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

const ROLES: Role[] = ['customer', 'operator', 'sales', 'content', 'catalog', 'admin'];
const TIER_LABEL: Record<string, string> = { iron: 'آهنی', steel: 'فولادی', poolad: 'پولادی' };

export function UsersTable() {
  const toast = useToast();
  const qc = useQueryClient();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', role, q],
    queryFn: () => adminApi.users({ role: role || undefined, q: q || undefined }),
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

  const users = data?.users ?? [];

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
        </div>
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : users.length === 0 ? (
          <EmptyState size="section" headline="کاربری نیست" body="با این فیلتر کاربری پیدا نشد." />
        ) : (
          <table className={ui.table}>
            <thead>
              <tr>
                <th>موبایل</th>
                <th>نام</th>
                <th>نقش</th>
                <th>وضعیت</th>
                <th>عضویت</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={`tnum ${ui.mono}`}>{u.mobile}</td>
                  <td>
                    {u.name ?? '—'} {u.clubTier ? <Badge tone="accent">{TIER_LABEL[u.clubTier]}</Badge> : null}
                  </td>
                  <td>
                    <select
                      className={ui.select}
                      value={u.role}
                      onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value } })}
                      aria-label={`نقش ${u.mobile}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={ui.select}
                      value={u.isActive === false ? 'off' : 'on'}
                      onChange={(e) => update.mutate({ id: u.id, patch: { isActive: e.target.value === 'on' } })}
                      aria-label={`وضعیت ${u.mobile}`}
                    >
                      <option value="on">فعال</option>
                      <option value="off">غیرفعال</option>
                    </select>
                  </td>
                  <td className="tnum">{formatJalali(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data ? <p className={ui.muted}>{toPersianDigits(data.total)} کاربر</p> : null}
      </div>

      <ClubSection />
    </div>
  );
}

function ClubSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'club'], queryFn: () => adminApi.clubMembers() });
  const setTier = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: 'iron' | 'steel' | 'poolad' }) => adminApi.setClubTier(id, tier),
    onSuccess: () => {
      toast.success('سطح باشگاه به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'club'] });
    },
    onError: () => toast.error('به‌روزرسانی ناموفق بود.'),
  });

  const members = data?.members ?? [];

  return (
    <div>
      <Heading level={3}>باشگاه مشتریان</Heading>
      {isLoading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : members.length === 0 ? (
        <p className={ui.muted}>هنوز عضوی ندارد.</p>
      ) : (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>موبایل</th>
              <th>نام</th>
              <th>سطح</th>
              <th>عضویت</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className={`tnum ${ui.mono}`}>{m.mobile}</td>
                <td>{m.name ?? '—'}</td>
                <td>
                  <select
                    className={ui.select}
                    value={m.tier}
                    onChange={(e) => setTier.mutate({ id: m.id, tier: e.target.value as 'iron' })}
                    aria-label={`سطح ${m.mobile}`}
                  >
                    <option value="iron">آهنی</option>
                    <option value="steel">فولادی</option>
                    <option value="poolad">پولادی</option>
                  </select>
                </td>
                <td className="tnum">{formatJalali(m.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
