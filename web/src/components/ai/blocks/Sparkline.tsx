import { useId } from 'react';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import styles from './blocks.module.css';

/**
 * The price line, at chat-bubble size.
 *
 * A deliberately smaller, quieter relative of `catalog/PriceChart` rather than
 * a reuse of it: that component owns range tabs, a hover tooltip, an axis and
 * an accessible data table, all of which are right on a product page and all
 * of which are wrong inside a message bubble 300px wide. What IS shared is the
 * conventions, because a visitor who has seen one chart on this site must be
 * able to read this one: time runs left→right even though the page is RTL
 * (`direction: ltr` on the frame, exactly as PriceChart documents), and the
 * fill is tinted by the NET direction of the window, gain or loss.
 *
 * Accessibility: the SVG is decorative and the summary underneath is the real
 * content — first date, last date, and the change between them, as text. A
 * screen reader gets the fact; it does not get read a list of 30 numbers.
 */
export function Sparkline({
  values,
  dates,
  unitLabel,
  changePct,
  label,
}: {
  values: number[];
  dates?: string[];
  unitLabel?: string;
  changePct?: number;
  /** Sentence prefix for the visually-hidden summary. */
  label: string;
}) {
  const id = useId();
  if (values.length < 2) return null;

  const w = 240;
  const h = 48;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const stepX = (w - pad * 2) / (values.length - 1);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2));
  const x = (i: number) => pad + i * stepX;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  // Close DOWN from the last point, then back along the baseline — the same
  // ordering PriceChart had to be corrected to, for the same reason: closing
  // to under the FIRST point draws a wedge across the line instead of a fill
  // that hugs it.
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${h - pad} L ${x(0).toFixed(1)} ${h - pad} Z`;

  const first = values[0]!;
  const last = values[values.length - 1]!;
  const dir = last > first ? 'up' : last < first ? 'down' : 'flat';
  const tone = dir === 'up' ? styles.sparkUp : dir === 'down' ? styles.sparkDown : styles.sparkFlat;

  const firstDate = dates?.[0];
  const lastDate = dates?.[dates.length - 1];
  const summary = [
    label,
    firstDate && lastDate ? `از ${formatJalali(firstDate)} تا ${formatJalali(lastDate)}` : '',
    `از ${formatToman(first, false)} به ${formatToman(last, false)}${unitLabel ? ` ${unitLabel}` : ' تومان'}`,
    changePct !== undefined
      ? `، ${dir === 'down' ? 'کاهش' : dir === 'up' ? 'افزایش' : 'بدون تغییر'} ${toPersianDigits(
          Math.abs(changePct).toFixed(1),
        )} درصد`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <figure className={`${styles.spark} ${tone}`}>
      <svg
        className={styles.sparkSvg}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id}-fill)`} stroke="none" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r="2.5" fill="currentColor" />
      </svg>
      <figcaption className="visually-hidden">{summary}</figcaption>
    </figure>
  );
}
