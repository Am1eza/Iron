'use client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { alertsApi } from '@/lib/api/resources/misc';
import { ApiError } from '@/lib/api/errors';
import { useAlerts } from '@/lib/hooks/useAlerts';
import { useToast } from '@/lib/hooks/useToast';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { formatAlertValue, alertDistance } from '@/lib/utils/alerts';
import type { Alert } from '@/lib/types/domain';
import { Badge, Button, EmptyState, TableSkeleton, emptyPresets } from '@/components/ui';
import styles from './RequestsList.module.css';
import alertStyles from './AlertsList.module.css';

// Standardized on the admin AlertsPanel's wording for the `triggered` status
// (اجراشده) — the old «اعلان‌شده» here was a second, inconsistent term for
// the exact same state.
const STATUS_LABEL: Record<Alert['status'], string> = {
  active: 'فعال',
  triggered: 'اجراشده',
  paused: 'متوقف',
};
const STATUS_TONE: Record<Alert['status'], 'gain' | 'accent' | 'stale'> = {
  active: 'gain',
  triggered: 'accent',
  paused: 'stale',
};
const TARGET_TYPE_LABEL: Record<Alert['target']['type'], string> = {
  sku: 'کالا',
  market: 'شاخص بازار',
};

/** Live alerts (قیمت‌سنج) — pause / re-arm / delete from the account.
 *  Creation itself happens from the bell trigger on price rows, the SKU
 *  page and the market board (`AlertBellButton`); this tab is management +
 *  status only. */
export function AlertsList() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useAlerts();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.myAlerts() });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      alertsApi[status === 'active' ? 'reactivate' : 'pause'](id),
    onSuccess: () => {
      invalidate();
      toast.success('هشدار به‌روزرسانی شد.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی هشدار ناموفق بود.'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => alertsApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('هشدار حذف شد.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'حذف هشدار ناموفق بود.'),
  });

  if (isLoading) return <TableSkeleton rows={3} cols={4} />;
  if (isError) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="خطا در دریافت هشدارها"
        primary={{ label: 'تلاش دوباره', onClick: () => refetch() }}
      />
    );
  }

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) {
    return <EmptyState size="section" {...emptyPresets.alertsEmpty()} />;
  }

  return (
    <ul className={styles.list}>
      {alerts.map((a) => {
        const label = a.target.label ?? 'این مورد دیگر در دسترس نیست';
        const dist = a.status === 'active' ? alertDistance(a.currentValue, a.threshold, a.op) : null;
        return (
          <li key={a.id} className={styles.item}>
            <div className={styles.top}>
              <div className={styles.titleWrap}>
                <span className={styles.type}>{TARGET_TYPE_LABEL[a.target.type]}</span>
                <h3 className={styles.title}>{label}</h3>
              </div>
              <div className={styles.meta}>
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                <span className={`${styles.date} tnum`}>
                  {a.status === 'triggered' && a.lastTriggeredAt
                    ? `اجرا: ${formatJalali(a.lastTriggeredAt)}`
                    : `ثبت: ${formatJalali(a.createdAt)}`}
                </span>
              </div>
            </div>

            <p className={styles.detail}>
              {a.op === 'below' ? 'کمتر از' : 'بیشتر از'}{' '}
              <bdi className="tnum">{formatToman(a.threshold, false)}</bdi> تومان
            </p>

            {a.currentValue != null ? (
              <p className={alertStyles.live}>
                <span className={alertStyles.liveLabel}>اکنون:</span>{' '}
                <bdi className="tnum">{formatAlertValue(a.currentValue, a.target)}</bdi>
                {dist ? (
                  dist.crossed ? (
                    <Badge tone="warning">به شرط هشدار رسیده — به‌زودی پیامک می‌گیرید</Badge>
                  ) : dist.near ? (
                    <Badge tone="warning">٪{toPersianDigits(dist.pct.toFixed(1))} فاصله تا رسیدن</Badge>
                  ) : (
                    <span className={alertStyles.distanceMuted}>
                      ٪{toPersianDigits(dist.pct.toFixed(1))} فاصله تا رسیدن
                    </span>
                  )
                ) : null}
                {a.isStale ? <span className={alertStyles.staleNote}>(به‌روزرسانی نشده)</span> : null}
              </p>
            ) : null}

            <div className={alertStyles.actions}>
              {a.status !== 'active' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patch.mutate({ id: a.id, status: 'active' })}
                  loading={patch.isPending && patch.variables?.id === a.id}
                  disabled={patch.isPending || remove.isPending}
                >
                  فعال‌سازی
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patch.mutate({ id: a.id, status: 'paused' })}
                  loading={patch.isPending && patch.variables?.id === a.id}
                  disabled={patch.isPending || remove.isPending}
                >
                  توقف
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove.mutate(a.id)}
                loading={remove.isPending && remove.variables === a.id}
                disabled={remove.isPending || patch.isPending}
              >
                حذف
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
