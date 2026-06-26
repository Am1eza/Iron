import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'action'
  | 'gain'
  | 'loss'
  | 'stale'
  | 'success'
  | 'info'
  | 'warning';

/** B1 · Badge — a small status/label pill. Color is always paired with text. */
export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** Count badge (cart / notifications) — a small circular counter. */
export function CountBadge({ count, max = 99 }: { count: number; max?: number }) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span className={`${styles.count} tnum`} aria-hidden="true">
      {text}
    </span>
  );
}
