'use client';
import styles from './Sparkline.module.css';

const W = 64;
const H = 20;
const PAD = 2;

/**
 * E6 · Inline price-trend sparkline for a by-size comparison row. Decorative
 * supplement to the row's own نوسان (MovementBadge) — that badge (text +
 * icon) is the accessible trend signal a screen reader gets; this is
 * `aria-hidden`, never the only way to perceive the trend.
 *
 * Same RTL time convention as the full chart (PriceChart.tsx): newest point
 * on the LEFT, so reading right→left — the natural RTL direction — reads
 * oldest→newest, i.e. "forward in time". Muted stroke for history, brand
 * accent only on the current (last) point.
 */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const stepX = (W - PAD * 2) / (points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const x = (i: number) => W - PAD - i * stepX;
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const lastIdx = points.length - 1;
  return (
    <svg
      className={styles.spark}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={line} fill="none" className={styles.line} />
      <circle cx={x(lastIdx)} cy={y(points[lastIdx]!)} r="2" className={styles.dot} />
    </svg>
  );
}
