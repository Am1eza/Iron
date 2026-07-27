import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

/**
 * B7 · Skeleton — calm shimmering placeholder (static under reduced-motion).
 * Use while data loads so the UI never flashes empty (empty-states §6 anti-flash).
 */
export function Skeleton({
  variant = 'block',
  width,
  height,
  className,
}: {
  variant?: 'text' | 'block' | 'circle';
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  const style: CSSProperties = { inlineSize: width, blockSize: height };
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, styles[variant], className].filter(Boolean).join(' ')}
      style={style}
    />
  );
}

/** A multi-line text skeleton; the last line is shortened. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </span>
  );
}

/**
 * A loading stand-in for any tabular view (E1 · loading state).
 * `label` is announced by screen readers: it used to be hardcoded to the price
 * Datasheet's wording, so the leads desk / users / audit tables all told blind
 * users they were "loading prices". Callers on a non-price table should pass
 * their own noun; the default stays deliberately generic.
 */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  label = 'در حال بارگذاری',
}: {
  rows?: number;
  cols?: number;
  label?: string;
}) {
  return (
    <div className={styles.table} role="status" aria-label={label}>
      <div className={styles.tableHead}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" width="70%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={styles.tableRow}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} variant="text" width={c === 0 ? '90%' : '55%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
