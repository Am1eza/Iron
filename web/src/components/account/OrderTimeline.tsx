'use client';
/**
 * OrderTimeline — accessible shipment stepper for a cargo order.
 * Presentational: pass the current `status`; done steps fill emerald/gain with a
 * check, the current step is emphasized, future steps are hairline. RTL-native,
 * reduced-motion safe. (request #11)
 */
import { useTranslations } from 'next-intl';
import { SHIPMENT_STEPS, type ShipmentStatus } from '@/lib/types/domain';
import { shipmentStatusLabel } from '@/lib/utils/shipmentStatusLabel';
import styles from './OrderTimeline.module.css';

function CheckIcon() {
  return (
    <svg className={styles.check} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** `cancelled`: the shipment stopped moving, it didn't complete — the steps
 *  freeze at whatever they'd reached (still useful: "it got as far as
 *  بارگیری before it was cancelled") but nothing reads as "current" anymore,
 *  since there is no longer an active next step. */
export function OrderTimeline({ status, cancelled = false }: { status: ShipmentStatus; cancelled?: boolean }) {
  const t = useTranslations('account.shipmentStatus');
  const currentIndex = SHIPMENT_STEPS.findIndex((s) => s.key === status);
  const currentLabel = shipmentStatusLabel(status, t);

  return (
    <>
      {cancelled ? <p className={styles.cancelledNote}>{t('cancelledNote', { stage: currentLabel })}</p> : null}
      <ol
        className={`${styles.timeline} ${cancelled ? styles.cancelled : ''}`}
        aria-label={cancelled ? t('ariaCancelled', { stage: currentLabel }) : t('ariaActive', { stage: currentLabel })}
      >
        {SHIPMENT_STEPS.map((step, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? (cancelled ? 'done' : 'current') : 'future';
          return (
            <li
              key={step.key}
              className={`${styles.step} ${styles[state]}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={styles.dot}>
                {state === 'done' ? <CheckIcon /> : <span className={styles.bullet} aria-hidden="true" />}
              </span>
              <span className={styles.label}>
                {shipmentStatusLabel(step.key, t)}
                {state === 'current' ? <span className={styles.tag}>{t('currentStageTag')}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
