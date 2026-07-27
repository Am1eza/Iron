'use client';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './charts.module.css';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Donut for composition of a whole with FEW categories (pipeline status,
 * shipment stage) — the case where a donut is legitimately the clearest
 * form: the center carries the total, and the reader wants the mix, not a
 * precise A-vs-B comparison (that's what the horizontal bars are for).
 * Slices are drawn as stroke-dasharray arcs on one circle: no path math,
 * no library, and it stays crisp at any size.
 */
export function DonutChart({
  slices,
  size = 168,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel: string;
  centerValue: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={styles.donutWrap}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={styles.donutSvg}
        role="img"
        aria-label={`${centerLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join('، ')}`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth="18" />
        {total > 0
          ? slices.map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="18"
                  // 1px gap between slices so adjacent hues stay distinguishable
                  strokeDasharray={`${Math.max(0, len - 1)} ${c}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })
          : null}
        <g transform={`rotate(90 ${size / 2} ${size / 2})`}>
          <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className={styles.donutValue}>
            {toPersianDigits(centerValue)}
          </text>
          <text x="50%" y="62%" textAnchor="middle" className={styles.donutCenterLabel}>
            {centerLabel}
          </text>
        </g>
      </svg>

      <ul className={styles.donutLegend}>
        {slices.map((s) => (
          <li key={s.label}>
            <i className={styles.swatch} style={{ background: s.color }} />
            <span className={styles.donutLegendLabel}>{s.label}</span>
            <span className="tnum">{toPersianDigits(s.value)}</span>
            <span className={styles.donutLegendPct}>
              {total > 0 ? `${toPersianDigits(Math.round((s.value / total) * 100))}٪` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
