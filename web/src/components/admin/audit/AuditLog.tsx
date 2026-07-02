'use client';
/** Read-only audit trail — every admin/system write, with before/after diffs. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'audit', entityType, page],
    queryFn: () => adminApi.audit({ entityType: entityType || undefined, page }),
  });

  const entries = data?.entries ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div>
      <div className={ui.toolbar}>
        {ENTITY_FILTERS.map((f) => (
          <Chip key={f.id} selected={entityType === f.id} onClick={() => { setEntityType(f.id); setPage(1); }}>
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
          <thead>
            <tr>
              <th>زمان</th>
              <th>عملیات</th>
              <th>موجودیت</th>
              <th>کاربر</th>
              <th>جزئیات</th>
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

      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          صفحهٔ قبل
        </Button>
        <span className={`${ui.muted} tnum`}>
          صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          صفحهٔ بعد
        </Button>
      </div>
    </div>
  );
}
