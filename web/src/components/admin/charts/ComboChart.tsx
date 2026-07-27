'use client';
import { useId, useState } from 'react';
import { toPersianDigits, formatTomanCompact } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import styles from './charts.module.css';

export interface ComboPoint {
  day: string;
  value: number;
  count: number;
}

/**
 * Revenue trend — daily bars (proforma VALUE) with a smoothed count line on a
 * secondary scale, the standard "money + volume in one frame" combo. Two
 * deliberate choices:
 *  - The last day is today (partial): its bar is hatched and the line stops
 *    short of it, so an in-progress day never reads as a crash.
 *  - Bars, not an area: daily money is a discrete quantity per day, and an
 *    area chart implies interpolation between days that doesn't exist.
 * Pure SVG on purpose — the strict CSP rules out CDN chart libs, and a
 * bundled one would cost more than this whole page.
 */
export function ComboChart({ data, height = 240 }: { data: ComboPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  if (data.length === 0) return null;

  const W = 760;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  // Round the value axis up to a "nice" number so gridline labels are readable.
  const niceMax = niceCeil(maxValue);

  const slot = innerW / data.length;
  const barW = Math.max(2, Math.min(26, slot * 0.62));
  const xCenter = (i: number) => padL + slot * i + slot / 2;
  const yValue = (v: number) => padT + innerH - (v / niceMax) * innerH;
  const yCount = (c: number) => padT + innerH - (c / maxCount) * innerH * 0.82;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  // The line skips the final (partial) point; it's drawn as a dashed tail.
  const solidPts = data.slice(0, -1).map((d, i) => `${xCenter(i)},${yCount(d.count)}`);
  const lastIdx = data.length - 1;

  const shown = hover === null ? null : data[hover];

  return (
    <div className={styles.comboWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.comboSvg}
        role="img"
        aria-label="نمودار روند ارزش پیش‌فاکتورها و تعداد آن‌ها به تفکیک روز"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* hatch for the in-progress day */}
          <pattern id={`${clipId}-hatch`} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--chart-track)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-1)" strokeWidth="3" opacity="0.55" />
          </pattern>
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
              {g === 0 ? '۰' : formatTomanCompact(Math.round(niceMax * g))}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const partial = i === lastIdx;
          const y = yValue(d.value);
          return (
            <g key={d.day}>
              {/* full-height hit area: hovering anywhere in the column works */}
              <rect
                x={padL + slot * i}
                y={padT}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {hover === i ? (
                <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="var(--chart-track)" opacity="0.5" />
              ) : null}
              <rect
                x={xCenter(i) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(0, padT + innerH - y)}
                rx="3"
                fill={partial ? `url(#${clipId}-hatch)` : 'var(--chart-1)'}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            </g>
          );
        })}

        {solidPts.length > 1 ? (
          <polyline
            points={solidPts.join(' ')}
            fill="none"
            stroke="var(--chart-3)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {solidPts.length > 0 ? (
          <line
            x1={xCenter(lastIdx - 1)}
            y1={yCount(data[lastIdx - 1]!.count)}
            x2={xCenter(lastIdx)}
            y2={yCount(data[lastIdx]!.count)}
            stroke="var(--chart-3)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        ) : null}
        {hover !== null ? (
          <circle cx={xCenter(hover)} cy={yCount(data[hover]!.count)} r="4" fill="var(--color-surface)" stroke="var(--chart-3)" strokeWidth="2" />
        ) : null}

        {/* x labels: first, middle, last — a label per day is unreadable at 90d */}
        {[0, Math.floor(lastIdx / 2), lastIdx].map((i) => (
          <text key={i} x={xCenter(i)} y={H - 8} textAnchor="middle" className={styles.axisText}>
            {formatJalali(data[i]!.day, 'd MMM')}
          </text>
        ))}
      </svg>

      <div className={styles.comboLegend}>
        <span>
          <i className={styles.swatch} style={{ background: 'var(--chart-1)' }} /> ارزش پیش‌فاکتور
        </span>
        <span>
          <i className={styles.swatchLine} style={{ background: 'var(--chart-3)' }} /> تعداد پیش‌فاکتور
        </span>
        <span className={styles.legendNote}>ستون هاشورخورده: امروز (ناتمام)</span>
      </div>

      <p className={styles.comboReadout} aria-live="polite">
        {shown ? (
          <>
            <strong>{formatJalali(shown.day, 'd MMMM')}</strong> — {formatTomanCompact(shown.value)} تومان ·{' '}
            {toPersianDigits(shown.count)} پیش‌فاکتور
          </>
        ) : (
          'برای دیدن جزئیات هر روز، نشانگر را روی نمودار ببرید.'
        )}
      </p>
    </div>
  );
}

/** 1/2/5×10ⁿ ceiling so axis labels land on round numbers. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
