'use client';
import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api/http';
import { stepsForType, REQUEST_TYPE_LABEL, type RequestStatus, type RequestType } from '@/lib/stores/requests';
import { EmptyState, TableSkeleton, emptyPresets } from '@/components/ui';
import { formatJalali } from '@/lib/utils/jalali';
import styles from './RequestsList.module.css';

interface RequestDto {
  id: string;
  ref: string;
  type: RequestType;
  title: string;
  detail?: string;
  status: RequestStatus;
  createdAt: string;
}

/**
 * «درخواست‌های من» — every proforma/bulk/warehouse request the user filed, with
 * a 4-step status trail. Reads the REAL server inbox (GET /api/me/requests),
 * not the old localStorage mock store.
 */
export function RequestsList() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['me', 'requests'],
    queryFn: () => http.get<{ requests: RequestDto[] }>('/api/me/requests'),
  });

  if (isLoading) return <TableSkeleton rows={3} />;
  if (isError) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="خطا در دریافت درخواست‌ها"
        primary={{ label: 'تلاش دوباره', onClick: () => refetch() }}
      />
    );
  }

  const requests = data?.requests ?? [];
  if (requests.length === 0) {
    // Shared preset, not a hand-rolled copy of it — a second, drifted-from
    // the-source copy of this exact headline/body used to live here (audit
    // finding, 2026-08-26), which is exactly the ad-hoc-dead-end drift
    // emptyPresets.ts exists to prevent.
    return <EmptyState size="section" {...emptyPresets.requestsEmpty()} />;
  }

  return (
    <ul className={styles.list}>
      {requests.map((r) => {
        const steps = stepsForType(r.type);
        const stepIndex = steps.findIndex((s) => s.key === r.status);
        return (
          <li key={r.id} className={styles.item}>
            <div className={styles.top}>
              <div className={styles.titleWrap}>
                <span className={styles.type}>{REQUEST_TYPE_LABEL[r.type]}</span>
                <h3 className={styles.title}>{r.title}</h3>
              </div>
              <div className={styles.meta}>
                <bdi className={`${styles.ref} tnum`}>{r.ref}</bdi>
                <span className={styles.date}>{formatJalali(r.createdAt)}</span>
              </div>
            </div>

            {r.detail && <p className={styles.detail}>{r.detail}</p>}

            <ol className={styles.steps} aria-label="وضعیت درخواست">
              {steps.map((s, i) => (
                <li
                  key={s.key}
                  className={styles.step}
                  data-done={i <= stepIndex ? '' : undefined}
                  aria-current={i === stepIndex ? 'step' : undefined}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.stepLabel}>{s.label}</span>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ul>
  );
}
