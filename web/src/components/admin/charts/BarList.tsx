'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './charts.module.css';

export interface BarRow {
  label: string;
  value: number;
  /** Rendered at the row's end — the formatted value, a rate, anything. */
  display: ReactNode;
  /** Secondary line under the label (e.g. «۳۲٪ موفق»). */
  sub?: ReactNode;
  color?: string;
  href?: string;
}

/**
 * Horizontal bar list — the honest default for comparing categories
 * (channels, best sellers). Bars share one scale so "twice as long" really
 * means twice as much, and long Persian labels get a full line instead of
 * being crushed into a pie legend.
 */
export function BarList({ rows, emptyText = 'داده‌ای نیست.' }: { rows: BarRow[]; emptyText?: string }) {
  if (rows.length === 0) return <p className={styles.chartEmpty}>{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className={styles.barList}>
      {rows.map((r) => {
        const body = (
          <>
            <div className={styles.barHead}>
              <span className={styles.barLabel}>{r.label}</span>
              <span className={`${styles.barValue} tnum`}>{r.display}</span>
            </div>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ inlineSize: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color ?? 'var(--chart-1)' }}
              />
            </div>
            {r.sub ? <span className={styles.barSub}>{r.sub}</span> : null}
          </>
        );
        return (
          <li key={r.label} className={styles.barRow}>
            {r.href ? (
              <Link href={r.href} className={styles.barLink}>
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
