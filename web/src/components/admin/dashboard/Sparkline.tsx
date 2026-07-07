/**
 * Sparkline — dependency-free SVG trend line for KPI cards. The last point is
 * today's PARTIAL count, drawn as a hollow dot on a dashed tail so an
 * in-progress day is never read as a drop (see analyticsRepo period math).
 * Direction is LTR (time axis) regardless of page RTL — standard for charts.
 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = 'var(--color-accent)',
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pad = 3;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (data.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - 2 * pad);
  const solid = data.slice(0, -1).map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]!);
  const prevX = x(data.length - 2);
  const prevY = y(data[data.length - 2]!);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      style={{ direction: 'ltr', display: 'block' }}
    >
      <polyline points={solid} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1={prevX} y1={prevY} x2={lastX} y2={lastY} stroke={stroke} strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx={lastX} cy={lastY} r="2.5" fill="var(--color-surface)" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
