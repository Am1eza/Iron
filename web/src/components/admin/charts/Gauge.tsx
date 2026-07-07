import { toPersianDigits } from '@/lib/utils/format';
import styles from './charts.module.css';

/** Score ring (0–100) — a single SVG circle with stroke-dasharray. Color is
 *  token-driven by band (good/warn/bad), never hardcoded hex. */
export function Gauge({
  value,
  max = 100,
  size = 84,
  sub,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  sub?: string;
  label?: string;
}) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const ratio = value / max;
  const stroke = ratio >= 0.8 ? 'var(--chart-good)' : ratio >= 0.55 ? 'var(--chart-warn)' : 'var(--chart-bad)';
  return (
    <div className={styles.gauge}>
      <svg
        className={styles.gaugeSvg}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label ?? `${toPersianDigits(value)} از ${toPersianDigits(max)}`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
        />
        {/* counter-rotate the text back upright (the svg is rotated -90°) */}
        <g transform={`rotate(90 ${size / 2} ${size / 2})`}>
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className={styles.gaugeLabel}>
            {toPersianDigits(value)}
          </text>
          {sub ? (
            <text x="50%" y="72%" textAnchor="middle" className={styles.gaugeSub}>
              {sub}
            </text>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
