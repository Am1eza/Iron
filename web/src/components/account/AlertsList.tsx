'use client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { queryKeys } from '@/lib/query/keys';
import { alertsApi } from '@/lib/api/resources/misc';
import { ApiError } from '@/lib/api/errors';
import { useAlerts } from '@/lib/hooks/useAlerts';
import { useToast } from '@/lib/hooks/useToast';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { formatAlertValue, alertDistance } from '@/lib/utils/alerts';
import type { Alert } from '@/lib/types/domain';
import { Badge, Button, EmptyState, TableSkeleton, emptyPresets } from '@/components/ui';
import styles from './RequestsList.module.css';
import alertStyles from './AlertsList.module.css';

const STATUS_TONE: Record<Alert['status'], 'gain' | 'accent' | 'stale'> = {
  active: 'gain',
  triggered: 'accent',
  paused: 'stale',
};

/** Live alerts (قیمت‌سنج) — pause / re-arm / delete from the account.
 *  Creation itself happens from the bell trigger on price rows, the SKU
 *  page and the market board (`AlertBellButton`); this tab is management +
 *  status only. */
export function AlertsList() {
  const t = useTranslations('account.alerts');
  const locale = useLocale();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useAlerts();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.myAlerts() });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      alertsApi[status === 'active' ? 'reactivate' : 'pause'](id),
    onSuccess: () => {
      invalidate();
      toast.success(t('updateSuccess'));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('updateError')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => alertsApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('removeSuccess'));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('removeError')),
  });

  if (isLoading) return <TableSkeleton rows={3} cols={4} />;
  if (isError) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline={t('errorHeadline')}
        primary={{ label: t('retry'), onClick: () => refetch() }}
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
        // `a.target.label` is a live SKU/market-index display name straight from
        // the API — no category/sub-category context here to recompose a
        // translated name from (same residual gap as OrdersList's line items).
        const label = a.target.label ?? t('unavailableTarget');
        const dist = a.status === 'active' ? alertDistance(a.currentValue, a.threshold, a.op) : null;
        return (
          <li key={a.id} className={styles.item}>
            <div className={styles.top}>
              <div className={styles.titleWrap}>
                <span className={styles.type}>{t(`targetTypeLabel.${a.target.type}`)}</span>
                <h3 className={styles.title}>{label}</h3>
              </div>
              <div className={styles.meta}>
                <Badge tone={STATUS_TONE[a.status]}>{t(`statusLabel.${a.status}`)}</Badge>
                <span className={`${styles.date} tnum`}>
                  {a.status === 'triggered' && a.lastTriggeredAt
                    ? t('triggeredAt', { date: formatJalali(a.lastTriggeredAt) })
                    : t('registeredAt', { date: formatJalali(a.createdAt) })}
                </span>
              </div>
            </div>

            <p className={styles.detail}>
              {a.op === 'below' ? t('below') : t('above')}{' '}
              <bdi className="tnum">{formatToman(a.threshold, false)}</bdi> {t('tomanSuffix')}
            </p>

            {a.currentValue != null ? (
              <p className={alertStyles.live}>
                <span className={alertStyles.liveLabel}>{t('now')}</span>{' '}
                <bdi className="tnum">{formatAlertValue(a.currentValue, a.target)}</bdi>
                {dist ? (
                  dist.crossed ? (
                    <Badge tone="warning">{t('crossedSoon')}</Badge>
                  ) : dist.near ? (
                    <Badge tone="warning">{t('distancePct', { pct: localizeDigits(dist.pct.toFixed(1), locale) })}</Badge>
                  ) : (
                    <span className={alertStyles.distanceMuted}>
                      {t('distancePct', { pct: localizeDigits(dist.pct.toFixed(1), locale) })}
                    </span>
                  )
                ) : null}
                {a.isStale ? <span className={alertStyles.staleNote}>{t('staleNote')}</span> : null}
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
                  {t('activate')}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patch.mutate({ id: a.id, status: 'paused' })}
                  loading={patch.isPending && patch.variables?.id === a.id}
                  disabled={patch.isPending || remove.isPending}
                >
                  {t('pause')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove.mutate(a.id)}
                loading={remove.isPending && remove.variables === a.id}
                disabled={remove.isPending || patch.isPending}
              >
                {t('remove')}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
