'use client';
/** Contact-form inbox — mark messages handled. */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, Button, EmptyState, TableSkeleton } from '@/components/ui';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const PER_PAGE = 30;

export function MessagesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'contact-messages', page],
    queryFn: () => adminApi.contactMessages({ page, perPage: PER_PAGE }),
  });
  const handle = useMutation({
    mutationFn: (id: string) => adminApi.updateContactMessage(id, 'handled'),
    onSuccess: () => {
      toast.success('پیام رسیدگی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'contact-messages'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: () => toast.error('به‌روزرسانی ناموفق بود.'),
  });

  const messages = data?.messages ?? [];

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : messages.length === 0 ? (
        <EmptyState size="section" headline="پیامی نیست" body="پیام‌های فرم تماس اینجا می‌آید." />
      ) : (
        <table className={ui.table}>
          <caption className="visually-hidden">فهرست پیام‌های فرم تماس</caption>
          <thead>
            <tr>
              <th scope="col">فرستنده</th>
              <th scope="col">پیام</th>
              <th scope="col">تاریخ</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  <div className={`${ui.muted} tnum`}>{toPersianDigits(m.mobile)}</div>
                </td>
                <td style={{ maxInlineSize: '28rem' }}>{m.message}</td>
                <td className="tnum">{formatJalali(m.createdAt)}</td>
                <td>
                  {m.status === 'new' ? (
                    <Button size="sm" variant="secondary" onClick={() => handle.mutate(m.id)} loading={handle.isPending}>
                      رسیدگی شد
                    </Button>
                  ) : (
                    <Badge tone="neutral">رسیدگی‌شده</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} پیام</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}
