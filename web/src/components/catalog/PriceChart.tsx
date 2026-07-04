'use client';
import { useId, useMemo, useState } from 'react';
import { formatToman, formatJalali, toPersianDigits } from '@/lib/utils/format';
import styles from './PriceChart.module.css';

type Range = 7 | 30 | 90 | 365;
const RANGES: { v: Range; label: string }[] = [
  { v: 7, label: 'هفته' },
  { v: 30, label: 'ماه' },
  { v: 90, label: '۳ ماه' },
  { v: 365, label: 'سال' },
];

/**
 * E7 · Price chart — a clean SVG line/area with range tabs. Accessible: a
 * visually-hidden summary + table fallback. Gain/loss tinted by net change.
 * No dependency; the path is built from the (deterministic) series.
 */
export function PriceChart({ series, unit = 'تومان' }: { series: number[]; unit?: string }) {
  const [range, setRange] = useState<Range>(30);
  const id = useId();
  const data = useMemo(() => series.slice(-range), [series, range]);

  const w = 640;
  const h = 220;
  const pad = 8;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const y = (val: number) => h - pad - ((val - min) / span) * (h - pad * 2);
  // RTL: newest on the LEFT → reverse x so time reads right→left.
  const x = (i: number) => w - pad - i * stepX;

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(0).toFixed(1)} ${h - pad} L ${x(data.length - 1).toFixed(1)} ${h - pad} Z`;

  const first = data[0]!;
  const last = data[data.length - 1]!;
  const up = last >= first;
  const pct = (((last - first) / first) * 100).toFixed(1);
  const rangeLabel = RANGES.find((r) => r.v === range)?.label ?? '';
  // Each point in `data` is one day; the last entry is today, so walk backwards
  // from today to recover the calendar date for a given index (for the table
  // fallback below — the SVG itself has no per-point date, only the series).
  const dateFor = (i: number) => {
    const d = new Date();
    d.setDate(d.getDate() - (data.length - 1 - i));
    return d;
  };
  // Build text as single strings — interleaved text/expression nodes inside an
  // SVG <title> can hydrate-mismatch, so we render one text node per element.
  const titleText = `نمودار قیمت در ${rangeLabel}؛ از ${formatToman(first)} به ${formatToman(last)}`;
  const deltaText = `${up ? '▲' : '▼'} ${toPersianDigits(Math.abs(Number(pct)).toString())}٪`;

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div className={styles.now}>
          <span className={`${styles.nowVal} tnum`}>{formatToman(last, false)}</span>
          <span className={styles.nowUnit}>{unit}</span>
          <span className={`${styles.delta} ${up ? styles.up : styles.down} tnum`}>{deltaText}</span>
          {/* the daily movement badge elsewhere on the page uses the same up/down
              language for a different period — label this one so the two never
              read as contradicting each other */}
          <span className={styles.deltaPeriod}>طی {rangeLabel}</span>
        </div>
        <div className={styles.tabs} role="group" aria-label="بازهٔ زمانی">
          {RANGES.map((r) => (
            <button
              key={r.v}
              type="button"
              aria-pressed={range === r.v}
              className={styles.tab}
              data-active={range === r.v ? '' : undefined}
              onClick={() => setRange(r.v)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        className={styles.svg}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={id}
      >
        <title id={id}>{titleText}</title>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={up ? 'var(--color-gain)' : 'var(--color-loss)'} stopOpacity="0.18" />
            <stop offset="1" stopColor={up ? 'var(--color-gain)' : 'var(--color-loss)'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#grad-${id})`} />
        <path d={line} fill="none" stroke={up ? 'var(--color-gain)' : 'var(--color-loss)'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={x(data.length - 1)} cy={y(last)} r="3.5" fill={up ? 'var(--color-gain)' : 'var(--color-loss)'} />
      </svg>

      <div className={styles.axis}>
        <span>{formatToman(min, false)}</span>
        <span>کمینه / بیشینه</span>
        <span>{formatToman(max, false)}</span>
      </div>

      {/* Text/table alternative to the SVG (WCAG 1.1.1) — the trend summary in
          the SVG <title> above covers the gist, but a low-vision or screen-reader
          user still needs the actual series data, not just a min/max pair. */}
      <details className={styles.dataTableToggle}>
        <summary>جدول داده‌های نمودار</summary>
        <div className={styles.tableScroll}>
          <table>
            <caption className="visually-hidden">داده‌های نمودار قیمت</caption>
            <thead>
              <tr>
                <th scope="col">تاریخ</th>
                <th scope="col">قیمت</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v, i) => (
                <tr key={i}>
                  <td>{formatJalali(dateFor(i))}</td>
                  <td>{formatToman(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
