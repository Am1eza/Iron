'use client';
/** Orders — advance each shipment along SHIPMENT_STEPS; persists via the API. */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, Button, Card, EmptyState, TableSkeleton } from '@/components/ui';
import { Chip } from '@/components/ui';
import ui from '../adminUi.module.css';

export function OrdersManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'orders', status],
    queryFn: () => adminApi.orders({ status: status || undefined }),
  });
  const advance = useMutation({
    mutationFn: ({ ref, next }: { ref: string; next: string }) => adminApi.updateOrderStatus(ref, next),
    onSuccess: (res) => {
      toast.success(`وضعیت ${res.order.ref} به‌روزرسانی شد.`);
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: () => toast.error('به‌روزرسانی وضعیت ناموفق بود.'),
  });

  const orders = data?.orders ?? [];

  return (
    <div>
      <div className={ui.toolbar}>
        <Chip selected={status === ''} onClick={() => setStatus('')}>
          همه
        </Chip>
        {SHIPMENT_STEPS.map((s) => (
          <Chip key={s.key} selected={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری سفارش‌ها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : orders.length === 0 ? (
        <EmptyState size="section" headline="سفارشی نیست" body="سفارش‌ها از سرنخ‌های موفق ساخته می‌شوند (CRM ← تبدیل به سفارش)." />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {orders.map((o) => {
            const idx = SHIPMENT_STEPS.findIndex((s) => s.key === o.status);
            const next = SHIPMENT_STEPS[idx + 1];
            return (
              <Card key={o.ref}>
                <div className={ui.toolbar}>
                  <strong className="tnum">
                    <bdi>{o.ref}</bdi>
                  </strong>
                  <Badge tone={o.status === 'delivered' ? 'gain' : 'info'}>
                    {SHIPMENT_STEPS[idx]?.label ?? o.status}
                  </Badge>
                  <span className={`${ui.muted} tnum`}>ثبت: {formatJalali(o.placedAt)}</span>
                  <span className={`${ui.muted} tnum`}>آخرین تغییر: {formatJalali(o.lastUpdate)}</span>
                  {next ? (
                    <Button
                      size="sm"
                      style={{ marginInlineStart: 'auto' }}
                      onClick={() => advance.mutate({ ref: o.ref, next: next.key })}
                      loading={advance.isPending}
                    >
                      مرحلهٔ بعد: {next.label}
                    </Button>
                  ) : null}
                </div>
                <ol className={ui.toolbar} style={{ listStyle: 'none', padding: 0 }}>
                  {SHIPMENT_STEPS.map((s, i) => (
                    <li key={s.key} aria-current={i === idx ? 'step' : undefined}>
                      <Badge tone={i <= idx ? 'action' : 'neutral'} icon={i < idx ? <span aria-hidden="true">✓</span> : undefined}>
                        {s.label}
                      </Badge>
                    </li>
                  ))}
                </ol>
                <p className={ui.muted}>
                  {o.items.map((it) => `${it.name} × ${toPersianDigits(it.qty)}`).join(' · ') || 'بدون قلم'}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} سفارش</p> : null}
    </div>
  );
}
