'use client';
/** Read-only audit trail — every admin/system write, with before/after diffs. */
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { Badge, Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

const ENTITY_FILTERS = [
  { id: '', label: 'همه' },
  { id: 'sku', label: 'کالا' },
  { id: 'lead', label: 'سرنخ' },
  { id: 'order', label: 'سفارش' },
  { id: 'article', label: 'مقاله' },
  { id: 'setting', label: 'تنظیم' },
  { id: 'user', label: 'کاربر' },
];

export function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actionQ, setActionQ] = useState('');
  const [actorQ, setActorQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setActionQ(action.trim()), 300);
    return () => clearTimeout(t);
  }, [action]);
  useEffect(() => {
    const t = setTimeout(() => setActorQ(actor.trim()), 300);
    return () => clearTimeout(t);
  }, [actor]);

  // `to` is a date-only picker — sent as-is it means "up to today's
  // midnight" and silently drops every event from today after 00:00.
  const toParam = to ? `${to}T23:59:59` : undefined;

  // Keyset ("load more") instead of page numbers — the API is now
  // cursor-paginated (see auditRepo.listAudit): an ever-growing append-only
  // log has no cheap "page N of M" (that needs a total count(*), a full
  // table scan on every request), so there's no random page access anymore,
  // only "older" via nextCursor.
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'audit', entityType, actionQ, actorQ, from, to],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      adminApi.audit({
        entityType: entityType || undefined,
        action: actionQ || undefined,
        actor: actorQ || undefined,
        from: from || undefined,
        to: toParam,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div>
      <div className={ui.toolbar}>
        {ENTITY_FILTERS.map((f) => (
          <Chip key={f.id} selected={entityType === f.id} onClick={() => setEntityType(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div className={ui.toolbar}>
        <input
          className={`${ui.textCell} ${ui.mono}`}
          dir="ltr"
          placeholder="فیلتر عملیات (مثلاً catalog.sku.update)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="فیلتر عملیات"
        />
        <input
          className={ui.textCell}
          placeholder="فیلتر کاربر (نام یا موبایل)"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          aria-label="فیلتر کاربر"
        />
        <input type="date" className={ui.textCell} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="از تاریخ" />
        <span className={ui.muted}>تا</span>
        <input type="date" className={ui.textCell} value={to} onChange={(e) => setTo(e.target.value)} aria-label="تا تاریخ" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            window.location.href = adminApi.auditExportUrl({
              entityType: entityType || undefined,
              action: actionQ || undefined,
              actor: actorQ || undefined,
              from: from || undefined,
              to: toParam,
            });
          }}
        >
          خروجی اکسل
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری رویدادها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : entries.length === 0 ? (
        <EmptyState size="section" headline="رویدادی نیست" body="تغییرات ادمین اینجا ثبت می‌شود." />
      ) : (
        <table className={ui.table}>
          <caption className="visually-hidden">فهرست رویدادهای ثبت‌شده در گزارش تغییرات</caption>
          <thead>
            <tr>
              <th scope="col">زمان</th>
              <th scope="col">عملیات</th>
              <th scope="col">موجودیت</th>
              <th scope="col">کاربر</th>
              <th scope="col">جزئیات</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="tnum">{formatJalali(e.at)}</td>
                <td>
                  <Badge tone="neutral">
                    <span className={ui.mono}>{e.action}</span>
                  </Badge>
                </td>
                <td>
                  {e.entityType} <span className={`${ui.muted} ${ui.mono}`}>{e.entityId}</span>
                </td>
                <td>
                  {e.actorName ? (
                    <>
                      {e.actorName}
                      {e.actorMobile ? <div className={`${ui.muted} tnum`}>{toPersianDigits(e.actorMobile)}</div> : null}
                    </>
                  ) : e.actorMobile ? (
                    <span className="tnum">{toPersianDigits(e.actorMobile)}</span>
                  ) : e.actorId ? (
                    <span className={ui.mono}>{e.actorId}</span>
                  ) : (
                    'سیستم'
                  )}
                </td>
                <td>
                  {e.before || e.after ? (
                    <details>
                      <summary className={ui.muted}>نمایش</summary>
                      <pre className={ui.detailsPre}>{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre>
                    </details>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasNextPage && (
        <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
          <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? 'در حال بارگذاری…' : 'نمایش موارد قدیمی‌تر'}
          </Button>
        </div>
      )}
    </div>
  );
}
