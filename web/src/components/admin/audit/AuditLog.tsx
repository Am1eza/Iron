'use client';
/** Read-only audit trail — every admin/system write, with before/after diffs. */
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali } from '@/lib/utils/format';
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

  // Keyset ("load more") instead of page numbers — the API is now
  // cursor-paginated (see auditRepo.listAudit): an ever-growing append-only
  // log has no cheap "page N of M" (that needs a total count(*), a full
  // table scan on every request), so there's no random page access anymore,
  // only "older" via nextCursor.
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'audit', entityType],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      adminApi.audit({ entityType: entityType || undefined, cursor: pageParam }),
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
                <td className={ui.mono}>{e.actorId ?? 'سیستم'}</td>
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
