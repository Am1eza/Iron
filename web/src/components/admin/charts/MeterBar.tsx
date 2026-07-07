import { toPersianDigits } from '@/lib/utils/format';
import styles from './charts.module.css';

/** Horizontal labeled meter (0–100%) with a token-driven band color. Used for
 *  pass-rates and any single-value proportion. */
export function MeterBar({
  label,
  pct,
  title,
}: {
  label: string;
  pct: number; // 0..100
  title?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = clamped >= 80 ? 'var(--chart-good)' : clamped >= 50 ? 'var(--chart-warn)' : 'var(--chart-bad)';
  return (
    <div className={styles.meter} title={title}>
      <span className={styles.meterLabel}>{label}</span>
      <div className={styles.meterTrack}>
        <div className={styles.meterFill} style={{ inlineSize: `${Math.max(2, clamped)}%`, background: fill }} />
      </div>
      <span className={styles.meterValue}>{toPersianDigits(Math.round(clamped))}٪</span>
    </div>
  );
}

/** A neutral (brand-colored) proportional bar — for category breakdowns where
 *  the value isn't a "good/bad" percentage (e.g. leads per channel). */
export function BrandBar({
  label,
  value,
  max,
  display,
}: {
  label: string;
  value: number;
  max: number;
  display?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div className={styles.meter}>
      <span className={styles.meterLabel}>{label}</span>
      <div className={styles.meterTrack}>
        <div className={styles.meterFill} style={{ inlineSize: `${pct}%`, background: 'var(--chart-1)' }} />
      </div>
      <span className={styles.meterValue}>{display ?? toPersianDigits(value.toLocaleString('en-US'))}</span>
    </div>
  );
}
