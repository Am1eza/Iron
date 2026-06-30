/**
 * OrderTimeline — accessible shipment stepper for a cargo order.
 * Presentational: pass the current `status`; done steps fill emerald/gain with a
 * check, the current step is emphasized, future steps are hairline. RTL-native,
 * reduced-motion safe. (request #11)
 */
import { SHIPMENT_STEPS, type ShipmentStatus } from '@/lib/types/domain';
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

export function OrderTimeline({ status }: { status: ShipmentStatus }) {
  const currentIndex = SHIPMENT_STEPS.findIndex((s) => s.key === status);
  const currentLabel = SHIPMENT_STEPS[currentIndex]?.label ?? '';

  return (
    <ol className={styles.timeline} aria-label={`وضعیت سفارش: ${currentLabel}`}>
      {SHIPMENT_STEPS.map((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'future';
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
              {step.label}
              {state === 'current' ? <span className={styles.tag}>(مرحله فعلی)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
