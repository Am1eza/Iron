'use client';
import { useId, useMemo, useState } from 'react';
import { formatTomanCompact, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { EmptyState } from '@/components/ui';
import styles from './charts.module.css';
import type { PricePoint } from '@/lib/types/domain';

/**
 * Per-SKU price history — ONE line plus an area fill under it.
 *
 * This is the exact INVERSE of ComboChart's stated reasoning. ComboChart draws
 * bars and refuses an area because daily revenue is a discrete quantity per
 * day, so interpolating between two days would imply money that doesn't exist.
 * A price is the opposite kind of series: it is CONTINUOUS. The SKU had a
 * price at every instant between two observations — we merely didn't record
 * one — so a connecting line is a truthful statement about the world and the
 * area under it is the meaningful "level" the reader is after. Hence line +
 * fill here, bars there.
 *
 * Pure SVG for the same reason ComboChart is: the strict CSP rules out CDN
 * chart libs, a bundled one costs more than the page, and canvas would force
 * us to hand-implement RTL, Persian digits, Jalali labels and CSS-variable
 * theming that SVG gets for free — while making every label invisible to a
 * screen reader. These are real <text> nodes.
 *
 * No animation: tokens.css already zeroes every duration token under
 * prefers-reduced-motion, and a static draw needs none to begin with.
 */

/** A `1y` range can return many hundreds of points; past roughly this many the
 *  extra vertices are sub-pixel and cost only DOM. Keeps the visual envelope
 *  (first and last are always kept) while bounding the path length. */
const MAX_POINTS = 400;

export function decimate<T>(points: T[], max = MAX_POINTS): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  // The last observation is the current price — it must never be dropped by
  // the stride landing short of the end.
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function PriceHistoryChart({
  points,
  range,
  height = 260,
}: {
  points: PricePoint[];
  range: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();

  const data = useMemo(() => decimate(points), [points]);

  // A single observation is a dot, not a trend; zero is nothing at all.
  // Either way a "line" would be a degenerate shape that reads as a real
  // (flat) trend, which is a lie about data we don't have.
  if (data.length < 2) {
    return (
      <EmptyState
        size="inline"
        headline="تاریخچهٔ کافی برای نمودار نیست"
        body="برای این بازه دست‌کم دو قیمت ثبت‌شده لازم است."
      />
    );
  }

  const W = 760;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const prices = data.map((p) => p.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  // Unlike Sparkline (which only guards its max), a price axis is NOT
  // zero-based — a steel price that moves 2% on a 300,000 base would be an
  // invisible flat line against a 0 baseline. So we scale to [min, max], which
  // makes `max - min` a real divide-by-zero risk the moment every observation
  // is identical (a price held steady all month is entirely normal). Give a
  // flat series an artificial span so it renders as a centered flat line.
  const flat = rawMax - rawMin < Number.EPSILON;
  const span = flat ? Math.max(Math.abs(rawMax), 1) : rawMax - rawMin;
  const yMin = flat ? rawMin - span / 2 : rawMin - span * 0.08;
  const yMax = flat ? rawMax + span / 2 : rawMax + span * 0.08;
  const yRange = yMax - yMin || 1;

  const x = (i: number) => padL + (i * innerW) / (data.length - 1);
  const y = (v: number) => padT + innerH - ((v - yMin) / yRange) * innerH;

  const line = data.map((p, i) => `${x(i)},${y(p.price)}`).join(' ');
  const areaPath = `M ${padL},${padT + innerH} L ${line.split(' ').join(' L ')} L ${padL + innerW},${padT + innerH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  // 7d/30d/90d read as day-in-month; a year of daily ticks only makes sense
  // aggregated to the month.
  const labelPattern = range === '1y' ? 'yyyy/MM' : 'MM/dd';
  const lastIdx = data.length - 1;
  const labelIdx = [0, Math.floor(lastIdx / 2), lastIdx].filter((v, i, a) => a.indexOf(v) === i);

  const shown = hover === null ? null : data[hover];
  const first = data[0]!;
  const last = data[lastIdx]!;
  const deltaPct = first.price > 0 ? ((last.price - first.price) / first.price) * 100 : 0;

  return (
    <div className={styles.comboWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.comboSvg}
        role="img"
        aria-label={`نمودار تغییرات قیمت در بازهٔ انتخاب‌شده، از ${formatJalali(first.at)} تا ${formatJalali(last.at)}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + innerH - g * innerH}
              y2={padT + innerH - g * innerH}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <text x={W - padR} y={padT + innerH - g * innerH - 4} textAnchor="end" className={styles.axisText}>
              {formatTomanCompact(Math.round(yMin + g * yRange))}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradId}-fill)`} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Full-height hit columns: hovering anywhere in the column works. */}
        {data.map((p, i) => (
          <rect
            key={p.id || `${p.at}-${i}`}
            x={padL + (i * innerW) / data.length}
            y={padT}
            width={innerW / data.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null && shown ? (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={padT + innerH}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <circle
              cx={x(hover)}
              cy={y(shown.price)}
              r="4"
              fill="var(--color-surface)"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {/* First / middle / last only — a label per observation is unreadable. */}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className={styles.axisText}>
            {formatJalali(data[i]!.at, labelPattern)}
          </text>
        ))}
      </svg>

      <p className={styles.comboReadout} aria-live="polite">
        {shown ? (
          <>
            <strong>{formatJalali(shown.at)}</strong> — {formatTomanCompact(shown.price)} تومان
          </>
        ) : (
          <>
            {toPersianDigits(data.length)} قیمت ثبت‌شده · تغییر بازه:{' '}
            <strong>
              {deltaPct > 0 ? '+' : ''}
              {toPersianDigits(deltaPct.toFixed(1).replace(/\.0$/, '').replace('.', '٫'))}٪
            </strong>
          </>
        )}
      </p>
    </div>
  );
}
