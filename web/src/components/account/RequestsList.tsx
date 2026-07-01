'use client';
import { routes } from '@/lib/routes';
import {
  useRequestsStore,
  REQUEST_STEPS,
  REQUEST_TYPE_LABEL,
} from '@/lib/stores/requests';
import { EmptyState } from '@/components/ui';
import { formatJalali } from '@/lib/utils/format';
import styles from './RequestsList.module.css';

/**
 * «درخواست‌های من» — every proforma/bulk/warehouse request the user filed, with
 * a 4-step status trail (ثبت شد → بررسی → تماس → پیش‌فاکتور). Reads the local
 * requests store (mock persistence; swaps for the API later).
 */
export function RequestsList() {
  const requests = useRequestsStore((s) => s.requests);

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
            {r.note && <p className={styles.note}>یادداشت شما: {r.note}</p>}

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
