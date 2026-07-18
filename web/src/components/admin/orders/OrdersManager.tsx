'use client';
/** Orders — advance each shipment along SHIPMENT_STEPS, set carrier tracking
 *  info, or cancel/archive (US-08.4). Persists via the API. */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import type { Order } from '@/lib/types/domain';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Card, EmptyState, TableSkeleton, useConfirm } from '@/components/ui';
import { Chip } from '@/components/ui';
import ui from '../adminUi.module.css';

function ShippingFields({ order }: { order: Order }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [carrier, setCarrier] = useState(order.carrierName ?? '');
  const dirty = tracking !== (order.trackingNumber ?? '') || carrier !== (order.carrierName ?? '');

  const save = useMutation({
    mutationFn: () => adminApi.updateOrderShipping(order.ref, { trackingNumber: tracking, carrierName: carrier }),
    onSuccess: () => {
      toast.success('اطلاعات حمل ذخیره شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.'),
  });

  return (
    <div className={ui.toolbar}>
      <input
        className={ui.textCell}
        placeholder="نام حمل‌کننده"
        value={carrier}
        onChange={(e) => setCarrier(e.target.value)}
        aria-label={`حمل‌کنندهٔ سفارش ${order.ref}`}
      />
      <input
        className={`${ui.textCell} ${ui.mono}`}
        dir="ltr"
        placeholder="شمارهٔ رهگیری"
        value={tracking}
        onChange={(e) => setTracking(e.target.value)}
        aria-label={`شمارهٔ رهگیری سفارش ${order.ref}`}
      />
      {dirty ? (
        <Button size="sm" variant="ghost" onClick={() => save.mutate()} loading={save.isPending}>
          ذخیرهٔ حمل
        </Button>
      ) : null}
    </div>
  );
}

export function OrdersManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState('');
  const [cancelled, setCancelled] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'orders', status, cancelled],
    queryFn: () => adminApi.orders({ status: status || undefined, cancelled }),
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
  const cancel = useMutation({
    mutationFn: (ref: string) => adminApi.cancelOrder(ref),
    onSuccess: () => {
      toast.success('سفارش لغو شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'لغو سفارش ناموفق بود.'),
  });

  const askCancel = (ref: string) => {
    void confirm({
      title: 'لغو سفارش',
      body: `سفارش ${ref} لغو/آرشیو می‌شود؛ رکورد آن حذف نمی‌شود. ادامه؟`,
      confirmLabel: 'لغو کن',
    }).then((ok) => {
      if (ok) cancel.mutate(ref);
    });
  };

  const orders = data?.orders ?? [];

  return (
    <div>
      <div className={ui.toolbar}>
        <Chip
          selected={!cancelled && status === ''}
          onClick={() => {
            setCancelled(false);
            setStatus('');
          }}
        >
          همه
        </Chip>
        {SHIPMENT_STEPS.map((s) => (
          <Chip
            key={s.key}
            selected={!cancelled && status === s.key}
            onClick={() => {
              setCancelled(false);
              setStatus(s.key);
            }}
          >
            {s.label}
          </Chip>
        ))}
        <Chip
          selected={cancelled}
          onClick={() => {
            setCancelled(true);
            setStatus('');
          }}
        >
          لغوشده
        </Chip>
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
        <EmptyState
          size="section"
          headline={cancelled ? 'سفارش لغوشده‌ای نیست' : 'سفارشی نیست'}
          body="سفارش‌ها از سرنخ‌های موفق ساخته می‌شوند (CRM ← تبدیل به سفارش)."
        />
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
                  {!cancelled && next ? (
                    <Button
                      size="sm"
                      style={{ marginInlineStart: 'auto' }}
                      onClick={() => advance.mutate({ ref: o.ref, next: next.key })}
                      loading={advance.isPending}
                    >
                      مرحلهٔ بعد: {next.label}
                    </Button>
                  ) : null}
                  {!cancelled ? (
                    <Button size="sm" variant="ghost" onClick={() => askCancel(o.ref)} loading={cancel.isPending}>
                      لغو سفارش
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
                {!cancelled ? <ShippingFields order={o} /> : null}
                <p className={ui.muted}>
                  {o.items.map((it) => `${it.name} × ${toPersianDigits(it.qty)}`).join(' · ') || 'بدون قلم'}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} سفارش</p> : null}
      {dialog}
    </div>
  );
}
