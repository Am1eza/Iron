'use client';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './charts.module.css';

export interface FunnelStage {
  label: string;
  value: number;
  href?: string;
  /** Below this step-conversion (%) the stage is flagged as a leak. */
  benchmark?: number;
}

/**
 * Sales funnel — stage volume as proportional bars with the STEP conversion
 * printed between them, which is the number a manager acts on ("۹۲٪ of leads
 * never reach a proforma" is a decision; "۴۱۲ leads" is trivia). Stages whose
 * step conversion falls under their benchmark get a leak marker.
 *
 * Deliberately not a pie/donut of stages: a pie shows composition and hides
 * the drop-off between steps, which is the entire point of a funnel.
 */
export function SalesFunnel({ stages }: { stages: FunnelStage[] }) {
  const top = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className={styles.funnel}>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]! : null;
        const step = prev && prev.value > 0 ? Math.round((s.value / prev.value) * 1000) / 10 : null;
        const leak = step !== null && s.benchmark !== undefined && step < s.benchmark;
        const width = `${Math.max(1.5, (s.value / top) * 100)}%`;
        return (
          <div key={s.label}>
            {step !== null ? (
              <div className={styles.funnelStep}>
                <span className={`${styles.funnelStepPct} ${leak ? styles.funnelLeak : ''}`}>
                  ↓ {toPersianDigits(step)}٪
                  {leak ? <span className={styles.funnelLeakTag}>نشتی</span> : null}
                </span>
              </div>
            ) : null}
            <div className={styles.funnelRow}>
              <span className={styles.funnelName}>{s.label}</span>
              <div className={styles.funnelTrack}>
                <div
                  className={styles.funnelFill}
                  style={{ inlineSize: width, opacity: 1 - i * 0.13 }}
                />
              </div>
              <span className={`${styles.funnelNum} tnum`}>{toPersianDigits(s.value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
