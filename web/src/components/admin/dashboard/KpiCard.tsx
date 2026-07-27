import type { ReactNode } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import { Sparkline } from './Sparkline';
import styles from './dashboard.module.css';

/**
 * BI KPI card: label + change chip on top, the headline number with a SMALL,
 * separate unit (a giant «تومان» in display type was the old failure mode),
 * one meta line, and an optional sparkline pinned to the card's bottom edge.
 *
 * `delta` carries its own kind because the two are not interchangeable:
 *  - 'pct'  — a relative change of a count/amount («۱۲٪ رشد»).
 *  - 'pts'  — a change of a RATE, in percentage points. Reporting "۱۲٪ → ۱۵٪"
 *             as "+۲۵٪" is the classic dashboard lie; it is +۳ points.
 * A null delta value renders «جدید» (the prior window was zero, so a percent
 * would be infinite).
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  meta,
  series,
  className,
  format = (n) => toPersianDigits(n.toLocaleString('en-US')),
}: {
  label: string;
  value: number;
  unit?: string;
  delta?: { value: number | null; kind: 'pct' | 'pts' };
  meta?: ReactNode;
  series?: number[];
  className?: string;
  format?: (n: number) => string;
}) {
  const d = delta?.value ?? null;
  const up = d !== null && d > 0;
  const down = d !== null && d < 0;
  const suffix = delta?.kind === 'pts' ? ' واحد' : '٪';
  return (
    <div className={`${styles.kpi} ${className ?? ''}`}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiLabel}>{label}</span>
        {delta ? (
          <span
            className={`${styles.kpiDelta} ${up ? styles.kpiDeltaUp : ''} ${down ? styles.kpiDeltaDown : ''}`}
            aria-label={
              d === null
                ? 'دورهٔ قبل داده‌ای نداشت'
                : `${d > 0 ? 'رشد' : d < 0 ? 'افت' : 'بدون تغییر'} ${Math.abs(d)}${
                    delta.kind === 'pts' ? ' واحد درصد' : ' درصد'
                  } نسبت به دورهٔ قبل`
            }
          >
            {d === null ? 'جدید' : `${up ? '▲' : down ? '▼' : '＝'} ${toPersianDigits(Math.abs(d))}${suffix}`}
          </span>
        ) : null}
      </div>

      <div className={styles.kpiValueRow}>
        <span className={`${styles.kpiValue} tnum`}>{format(value)}</span>
        {unit ? <span className={styles.kpiUnit}>{unit}</span> : null}
      </div>

      {meta ? <p className={styles.kpiMeta}>{meta}</p> : null}

      {series && series.length > 1 ? (
        <div className={styles.kpiSpark}>
          <Sparkline data={series} width={220} height={34} />
        </div>
      ) : null}
    </div>
  );
}
