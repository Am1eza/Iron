'use client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { http } from '@/lib/api/http';
import { useToast } from '@/lib/hooks/useToast';
import { formatToman, formatJalali } from '@/lib/utils/format';
import { Badge, Button, EmptyState, emptyPresets } from '@/components/ui';
import styles from './RequestsList.module.css';

type AlertDto = {
  id: string;
  target: { type: 'sku' | 'market'; label?: string };
  op: 'below' | 'above';
  threshold: number;
  channel: string;
  status: 'active' | 'triggered' | 'paused';
  lastTriggeredAt?: string;
  createdAt: string;
};

const STATUS_LABEL: Record<AlertDto['status'], string> = {
  active: 'فعال',
  triggered: 'اعلان‌شده',
  paused: 'متوقف',
};

/** Live alerts (قیمت‌سنج) — pause / re-arm / delete from the account. */
export function AlertsList() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.myAlerts(),
    queryFn: () => http.get<{ alerts: AlertDto[] }>('/api/me/alerts'),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.myAlerts() });
  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      http.patch(`/api/me/alerts/${id}`, { status }),
    onSuccess: () => {
      invalidate();
      toast.success('هشدار به‌روزرسانی شد.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/api/me/alerts/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('هشدار حذف شد.');
    },
  });

  if (isLoading) return <p style={{ color: 'var(--color-text-muted)' }}>در حال بارگذاری…</p>;
  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) {
    return <EmptyState size="section" {...emptyPresets.alertsEmpty()} />;
  }

  return (
    <ul className={styles.list}>
      {alerts.map((a) => (
        <li key={a.id} className={styles.item}>
          <div>
            <p>
              {a.target.label ?? 'شاخص'} — {a.op === 'below' ? 'زیر' : 'بالای'}{' '}
              <span className="tnum">{formatToman(a.threshold, false)}</span> تومان{' '}
              <Badge tone={a.status === 'active' ? 'success' : a.status === 'triggered' ? 'warning' : 'neutral'}>
                {STATUS_LABEL[a.status]}
              </Badge>
            </p>
            <p style={{ color: 'var(--color-text-muted)', font: 'var(--t-body-sm)' }}>
              {a.status === 'triggered' && a.lastTriggeredAt
                ? `اعلان: ${formatJalali(a.lastTriggeredAt)}`
                : `ثبت: ${formatJalali(a.createdAt)}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {a.status !== 'active' ? (
              <Button variant="ghost" size="sm" onClick={() => patch.mutate({ id: a.id, status: 'active' })}>
                فعال‌سازی
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => patch.mutate({ id: a.id, status: 'paused' })}>
                توقف
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => remove.mutate(a.id)} disabled={remove.isPending}>
              حذف
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
