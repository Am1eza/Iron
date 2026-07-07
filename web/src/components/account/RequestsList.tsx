'use client';
import { useQuery } from '@tanstack/react-query';
import { routes } from '@/lib/routes';
import { http } from '@/lib/api/http';
import { REQUEST_STEPS, REQUEST_TYPE_LABEL, type RequestStatus, type RequestType } from '@/lib/stores/requests';
import { EmptyState, TableSkeleton } from '@/components/ui';
import { formatJalali } from '@/lib/utils/format';
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
    return (
      <EmptyState
        size="section"
        headline="هنوز درخواستی ثبت نکرده‌اید"
        body="از جدول‌های قیمت یا بخش مقایسهٔ کارخانه‌ها، درخواست پیش‌فاکتور بدهید؛ وضعیت آن همین‌جا دنبال می‌شود."
        primary={{ label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() }}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {requests.map((r) => {
        const stepIndex = REQUEST_STEPS.findIndex((s) => s.key === r.status);
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
              {REQUEST_STEPS.map((s, i) => (
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
