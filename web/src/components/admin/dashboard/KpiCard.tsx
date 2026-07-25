import type { ReactNode } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import { Sparkline } from './Sparkline';
import styles from './dashboard.module.css';

/**
 * BI-grade KPI card: header row (label + delta chip) → headline value with a
 * SEPARATE, small unit (a giant «تومان» set in the display font was the old
 * failure mode) → one compact meta line → sparkline anchored to the card's
 * bottom edge. `deltaPct === null` renders «جدید» (prior period was zero —
 * a percent would be ∞/misleading).
 */
export function KpiCard({
  label,
  value,
  unit,
  deltaPct,
  today,
  series,
  hint,
  className,
  format = (n) => toPersianDigits(n.toLocaleString('en-US')),
}: {
  label: string;
  value: number;
  /** Rendered small + muted beside the big number — never in display type. */
  unit?: string;
  deltaPct: number | null;
  today?: number;
  series?: number[];
  hint?: ReactNode;
  /** Bento sizing class (e.g. dashboard.hero / .wide) applied to the grid item. */
  className?: string;
  format?: (n: number) => string;
}) {
  const up = deltaPct !== null && deltaPct > 0;
  const down = deltaPct !== null && deltaPct < 0;
  return (
    <div className={`${styles.kpi} ${className ?? ''}`}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiLabel}>{label}</span>
        <span
          className={`${styles.kpiDelta} ${up ? styles.kpiDeltaUp : ''} ${down ? styles.kpiDeltaDown : ''}`}
          aria-label={
            deltaPct === null
              ? 'دورهٔ قبل صفر بود'
              : `${deltaPct > 0 ? 'رشد' : deltaPct < 0 ? 'افت' : 'بدون تغییر'} ${Math.abs(deltaPct)} درصد نسبت به هفتهٔ قبل`
          }
        >
          {deltaPct === null ? 'جدید' : `${up ? '▲' : down ? '▼' : '＝'} ${toPersianDigits(Math.abs(deltaPct))}٪`}
        </span>
      </div>

      <div className={styles.kpiValueRow}>
        <span className={`${styles.kpiValue} tnum`}>{format(value)}</span>
        {unit ? <span className={styles.kpiUnit}>{unit}</span> : null}
      </div>

      <p className={styles.kpiMeta}>
        ۷ روز کامل
        {today !== undefined ? (
          <>
            {' · '}امروز: <span className="tnum">{toPersianDigits(today)}</span>
          </>
        ) : null}
        {hint ? <> · {hint}</> : null}
      </p>

      {series && series.length > 1 ? (
        <div className={styles.kpiSpark}>
          <Sparkline data={series} width={220} height={36} />
        </div>
      ) : null}
    </div>
  );
}
