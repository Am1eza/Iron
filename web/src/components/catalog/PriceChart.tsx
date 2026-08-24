'use client';
import { useId, useMemo, useState } from 'react';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
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
export function PriceChart({
  series,
  dates,
  unit = 'تومان',
}: {
  series: number[];
  /** Real ISO timestamp per point, aligned with `series`. When present the
   *  data-table (and the axis/tooltip) use these instead of reconstructing
   *  dates by assuming one consecutive day per index — which is wrong for a
   *  daily series that skips non-trading days (the market board's case). */
  dates?: string[];
  unit?: string;
}) {
  const [range, setRange] = useState<Range>(30);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const id = useId();
  const data = useMemo(() => series.slice(-range), [series, range]);
  const dateData = useMemo(() => dates?.slice(-range), [dates, range]);

  // No history is a real, common state — a product priced for the first time
  // today, or never priced at all. Everything below indexes `data[0]` /
  // `data.length - 1` and divides by the first value, so an empty series would
  // render a NaN caption over an empty path. Say so instead. This must stay
  // AFTER the hooks above (rules of hooks) and BEFORE the arithmetic.
  if (data.length === 0) {
    return <p className={styles.empty}>هنوز سابقهٔ قیمتی برای این کالا ثبت نشده است.</p>;
  }

  const w = 640;
  const h = 160;
  const pad = 8;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const y = (val: number) =>
    max === min ? h / 2 : h - pad - ((val - min) / span) * (h - pad * 2);
  // Time axis is LTR (oldest → left, newest → right) even though the page is
  // RTL — the same, deliberate convention `admin/dashboard/Sparkline` already
  // documents ("standard for charts... regardless of page RTL"). Reversing it
  // per-component is exactly the inconsistency the audit flagged ("unclear
  // time direction"): a visitor who has seen one Persian financial chart
  // reads left-to-right time on this one too. `.chartArea` below forces
  // `direction: ltr` so the HTML axis/tooltip rows lay out the same way.
  const x = (i: number) => pad + i * stepX;

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  // Close the fill straight DOWN from the last plotted point to the baseline,
  // then straight back along the baseline to under the first point. The
  // previous order (down to under the FIRST point, then across to under the
  // LAST) drew a diagonal spanning the full chart width instead of a vertical
  // drop, which rendered as a triangular wedge slicing across the actual
  // jagged line rather than a fill that hugs it.
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${h - pad} L ${x(0).toFixed(1)} ${h - pad} Z`;

  // Unit-aware value formatting: formatToman() rounds and always appends
  // «تومان», which is wrong for the انس جهانی ticker (unit دلار, and it
  // carries a decimal). Toman values stay integer-rounded; a non-Toman
  // unit keeps up to one decimal and its own unit label.
  const fmtVal = (v: number) =>
    unit === 'تومان'
      ? formatToman(v, false)
      : toPersianDigits(v.toLocaleString('en-US', { maximumFractionDigits: 1 })).replace(/,/g, '٬');
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const up = last >= first;
  const pct = (((last - first) / first) * 100).toFixed(1);
  const rangeLabel = RANGES.find((r) => r.v === range)?.label ?? '';
  // Each point in `data` is one day; the last entry is today, so walk backwards
  // from today to recover the calendar date for a given index — used both by
  // the table fallback and the hover tooltip when `dates` wasn't supplied
  // (the mock series is one point per consecutive day, so this reconstruction
  // is exact there; live callers pass real `dates` instead).
  const dateFor = (i: number) => {
    const d = new Date();
    d.setDate(d.getDate() - (data.length - 1 - i));
    return d;
  };
  const labelFor = (i: number, pattern?: string) =>
    dateData?.[i] ? formatJalali(new Date(dateData[i]!), pattern) : formatJalali(dateFor(i), pattern);
  // Build text as single strings — interleaved text/expression nodes inside an
  // SVG <title> can hydrate-mismatch, so we render one text node per element.
  const titleText = `نمودار قیمت در ${rangeLabel}؛ از ${fmtVal(first)} ${unit} به ${fmtVal(last)} ${unit}`;
  const deltaText = `${up ? '▲' : '▼'} ${toPersianDigits(Math.abs(Number(pct)).toString())}٪`;
  // The <svg> stretches non-uniformly to fill its container width
  // (preserveAspectRatio="none", so x-scale and y-scale differ — the
  // container is typically ~2x the viewBox width). A <circle> drawn in
  // that same coordinate space inherits the distortion and renders as an
  // ellipse, not a dot. Percentages of the container box are isotropic
  // (real CSS pixels), so the "latest point" marker (and the hover dot) are
  // plain HTML dots positioned by percentage instead of SVG geometry.
  // `left`/`top` are physical properties (unaffected by `direction`), so this
  // math holds regardless of the LTR override on `.chartArea` below.
  const pctLeft = (i: number) => (x(i) / w) * 100;
  const pctTop = (v: number) => (y(v) / h) * 100;
  const markerLeftPct = pctLeft(data.length - 1);
  const markerTopPct = pctTop(last);

  // Hover/tap: map a pointer's physical X within the chart box to the
  // nearest data index. The percentage-along-width of a pointer event equals
  // `x(i)/w` for the nearest point (see the marker comment above — the SVG's
  // non-uniform stretch is still a linear one, so physical fractions and
  // internal-coordinate fractions agree), so this is a direct inverse of
  // `x()` rather than a second, independent measurement.
  const handlePointer = (e: { clientX: number; currentTarget: HTMLElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round((fx * w - pad) / stepX);
    setHoverIndex(Math.min(data.length - 1, Math.max(0, idx)));
  };
  const hoverVal = hoverIndex !== null ? data[hoverIndex] : undefined;
  // Flip the tooltip to whichever side keeps it inside `.chartArea`: past the
  // horizontal midpoint it hangs off the START edge instead of the END, and
  // for a point near the top (small `pctTop`) it renders BELOW the dot — the
  // default "above" placement would otherwise push it past the chart's own
  // top edge into the `نسبت به ابتدای بازه` line above.
  const tooltipTransform =
    hoverIndex !== null && hoverVal !== undefined
      ? `translate(${pctLeft(hoverIndex) > 50 ? '-100%' : '0'}, ${pctTop(hoverVal) < 25 ? '10px' : 'calc(-100% - 10px)'})`
      : undefined;

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div className={styles.now}>
          <span className={`${styles.nowVal} tnum`}>{fmtVal(last)}</span>
          <span className={styles.nowUnit}>{unit}</span>
          <span className={`${styles.delta} ${up ? styles.up : styles.down} tnum`}>{deltaText}</span>
        </div>
        <div className={styles.tabs} role="group" aria-label="بازهٔ زمانی">
          {RANGES.map((r) => (
            <button
              key={r.v}
              type="button"
              aria-pressed={range === r.v}
              className={styles.tab}
              data-active={range === r.v ? '' : undefined}
              onClick={() => {
                setRange(r.v);
                setHoverIndex(null);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {/* The daily movement badge elsewhere on the page uses the same up/down
          language for a different period — spelling out "vs. the start of
          THIS range" keeps the two from ever reading as contradicting each
          other, and answers the audit's "percent of what?" complaint. */}
      <p className={styles.deltaPeriod}>نسبت به ابتدای بازهٔ «{rangeLabel}»</p>

      <div className={styles.chartArea}>
        <div
          className={styles.svgWrap}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        >
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
          </svg>
          <span
            className={`${styles.marker} ${up ? styles.up : styles.down}`}
            style={{ left: `${markerLeftPct}%`, top: `${markerTopPct}%` }}
            aria-hidden="true"
          />
          {hoverIndex !== null && hoverVal !== undefined && (
            <>
              <span
                className={styles.hoverLine}
                style={{ left: `${pctLeft(hoverIndex)}%` }}
                aria-hidden="true"
              />
              <span
                className={styles.hoverDot}
                style={{ left: `${pctLeft(hoverIndex)}%`, top: `${pctTop(hoverVal)}%` }}
                aria-hidden="true"
              />
              <div
                className={styles.tooltip}
                style={{ left: `${pctLeft(hoverIndex)}%`, top: `${pctTop(hoverVal)}%`, transform: tooltipTransform }}
                aria-hidden="true"
              >
                <span className={styles.tooltipDate}>{labelFor(hoverIndex)}</span>
                <span className={`${styles.tooltipVal} tnum`}>{fmtVal(hoverVal)} {unit}</span>
              </div>
            </>
          )}
        </div>

        <div className={styles.dateAxis} aria-hidden="true">
          <span>{labelFor(0, 'MM/dd')}</span>
          {data.length > 2 && <span>{labelFor(Math.floor((data.length - 1) / 2), 'MM/dd')}</span>}
          <span>{labelFor(data.length - 1, 'MM/dd')}</span>
        </div>

        <div className={styles.axis}>
          <span>{fmtVal(min)}</span>
          <span>کمینه / بیشینه</span>
          <span>{fmtVal(max)}</span>
        </div>
      </div>

      {/* Text/table alternative to the SVG (WCAG 1.1.1) — the trend summary in
          the SVG <title> above covers the gist, but a low-vision or screen-reader
          user still needs the actual series data, not just a min/max pair (and
          the hover tooltip above is pointer-only, so this is also its keyboard/
          screen-reader equivalent). */}
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
                  <td>{labelFor(i)}</td>
                  <td>{`${fmtVal(v)} ${unit}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
