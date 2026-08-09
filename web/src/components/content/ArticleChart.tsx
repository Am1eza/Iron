/**
 * The `chart` block, as readers see it (US-12.4).
 *
 * NO CHARTING LIBRARY, DELIBERATELY. The obvious move is Recharts, and it was
 * the plan on paper — but every Recharts component is `'use client'` (hooks +
 * ResizeObserver), so putting one inside an article body would turn the whole
 * public article page into a client component and ship ~100 kB of charting
 * runtime to every anonymous reader of every article, chart or not. For
 * admin-entered bar/line data with at most three series that is a bad trade in
 * a product whose reachability story is Iran. This renders as plain SVG in a
 * Server Component instead: zero client JS, no layout shift, correct in
 * `next build`'s static output, and it is the same approach `catalog/PriceChart`
 * already takes for the price history plot.
 *
 * Colour comes from the design system's categorical `--chart-1..3` — the same
 * hues every BI surface in the panel uses — and stops at three series because
 * that is where those hues stop being separable under simulated colour-vision
 * deficiency (validated, not eyeballed). Every series additionally carries a
 * NON-colour encoding — a dash pattern and marker shape on a line, a fill
 * texture on a bar — so identity survives greyscale printing, forced-colors
 * mode, and the amber series' sub-3:1 contrast against a white surface. The
 * legend and the `<details>` data table are always present for the same
 * reason: nothing here is conveyed by colour alone (WCAG 1.4.1).
 */
import type { ChartAttrs, ChartSeries } from '@/lib/content/richDoc';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ArticleChart.module.css';

const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'] as const;
/** Secondary encoding #1 — line dash. Solid first so a single-series chart
 *  never looks like it is missing something. */
const SERIES_DASH = [undefined, '7 5', '2 4'] as const;
/** Secondary encoding #2 — marker shape, drawn at 9px so it clears the 8px
 *  minimum target the design system sets for a data point. */
const SERIES_SHAPE = ['circle', 'square', 'triangle'] as const;

const W = 720;
const H = 320;
const PAD_TOP = 16;
const PAD_BOTTOM = 44;
const AXIS_W = 76;
const PLOT_START = 10; // the far edge from the value axis
const PLOT_END = W - AXIS_W;
const PLOT_TOP = PAD_TOP;
const PLOT_BOTTOM = H - PAD_BOTTOM;

/** Persian digits + Persian separators, without Intl — `Intl.NumberFormat`
 *  output depends on the ICU build, and this string is rendered on the server
 *  and re-rendered on the client. */
function faNumber(v: number): string {
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  const [int, frac] = rounded.toString().split('.');
  const grouped = Number(int).toLocaleString('en-US');
  const out = frac ? `${grouped}.${frac}` : grouped;
  return toPersianDigits(out).replace(/,/g, '٬').replace(/\./g, '٫');
}

/** A 1 / 2 / 5 × 10ⁿ step, so gridline values read as round numbers rather
 *  than as whatever `(max-min)/4` happens to be. */
function niceStep(span: number): number {
  if (span <= 0) return 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

type Scale = { min: number; max: number; step: number; ticks: number[] };

function buildScale(values: number[], baselineZero: boolean): Scale {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Bars encode magnitude by AREA — a truncated baseline makes a 2% difference
  // look like a 5× one, which is the single most common way a chart lies. A
  // line encodes change, so it may zoom.
  let lo = baselineZero ? Math.min(0, dataMin) : dataMin;
  let hi = baselineZero ? Math.max(0, dataMax) : dataMax;
  if (lo === hi) {
    // A flat series still needs a plot area to sit in.
    const pad = Math.abs(lo) || 1;
    lo -= pad / 2;
    hi += pad / 2;
  }
  const step = niceStep(hi - lo);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return { min, max, step, ticks };
}

function markerPath(shape: (typeof SERIES_SHAPE)[number], cx: number, cy: number): string {
  const r = 4.5;
  if (shape === 'square') return `M ${cx - r} ${cy - r} h ${r * 2} v ${r * 2} h ${-r * 2} Z`;
  if (shape === 'triangle') return `M ${cx} ${cy - r * 1.15} L ${cx + r} ${cy + r * 0.8} L ${cx - r} ${cy + r * 0.8} Z`;
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
}

/** A rounded-top bar: 4px radius on the data end only, square where it meets
 *  the baseline, so the bar reads as anchored rather than floating. */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h);
  if (h <= 0.5) return '';
  return up
    ? `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`
    : `M ${x} ${y} L ${x} ${y + h - r} Q ${x} ${y + h} ${x + r} ${y + h} L ${x + w - r} ${y + h} Q ${x + w} ${y + h} ${x + w} ${y + h - r} L ${x + w} ${y} Z`;
}

export function ArticleChart({ attrs, idBase }: { attrs: ChartAttrs; idBase: string }) {
  const labels = (attrs.labels ?? []).map((l) => l ?? '');
  const series: ChartSeries[] = (attrs.series ?? []).slice(0, SERIES_COLORS.length);
  const numbers = series.flatMap((s) => s.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));

  const titleId = `${idBase}-title`;
  const descId = `${idBase}-desc`;
  const heading = attrs.title?.trim();

  if (labels.length === 0 || series.length === 0 || numbers.length === 0) {
    return (
      <figure className={styles.figure}>
        {heading ? <figcaption className={styles.title}>{heading}</figcaption> : null}
        <p className={styles.empty}>هنوز داده‌ای برای این نمودار ثبت نشده است.</p>
      </figure>
    );
  }

  const isBar = attrs.kind === 'bar';
  const scale = buildScale(numbers, isBar);
  const yOf = (v: number) => PLOT_BOTTOM - ((v - scale.min) / (scale.max - scale.min)) * (PLOT_BOTTOM - PLOT_TOP);
  const zeroY = yOf(Math.max(scale.min, Math.min(0, scale.max)));

  // RTL: the first category sits at the RIGHT edge and the series reads
  // right-to-left, matching how the rest of the site reads.
  const band = (PLOT_END - PLOT_START) / labels.length;
  const centerOf = (i: number) => PLOT_END - band * (i + 0.5);
  // A line's points sit on the edges of the plot, not inside bands.
  const pointOf = (i: number) =>
    labels.length === 1 ? (PLOT_START + PLOT_END) / 2 : PLOT_END - ((PLOT_END - PLOT_START) / (labels.length - 1)) * i;

  // Persian labels don't rotate legibly, so thin them out instead. Every
  // category is still listed in full in the data table below.
  const labelStride = Math.ceil(labels.length / 9);

  const unit = attrs.unit?.trim();
  const summary = [
    heading || 'نمودار',
    unit ? `بر حسب ${unit}` : '',
    `${toPersianDigits(labels.length)} دسته`,
    `${toPersianDigits(series.length)} سری داده`,
  ]
    .filter(Boolean)
    .join('؛ ');

  return (
    <figure className={styles.figure} role="group" aria-labelledby={heading ? titleId : undefined}>
      {heading ? (
        <figcaption id={titleId} className={styles.title}>
          {heading}
          {unit ? <span className={styles.unit}> ({unit})</span> : null}
        </figcaption>
      ) : null}

      {/* A legend is present for every multi-series chart, without exception —
          it is the only thing that makes the plot readable without colour. */}
      {series.length > 1 ? (
        <ul className={styles.legend}>
          {series.map((s, i) => (
            <li key={i} className={styles.legendItem}>
              <svg className={styles.legendSwatch} viewBox="0 0 20 12" aria-hidden="true" focusable="false">
                {isBar ? (
                  <rect x="2" y="1" width="16" height="10" rx="2" fill={SERIES_COLORS[i]} opacity={i === 0 ? 1 : 0.92} />
                ) : (
                  <>
                    <line
                      x1="1"
                      y1="6"
                      x2="19"
                      y2="6"
                      stroke={SERIES_COLORS[i]}
                      strokeWidth="2"
                      strokeDasharray={SERIES_DASH[i]}
                    />
                    <path d={markerPath(SERIES_SHAPE[i]!, 10, 6)} fill={SERIES_COLORS[i]} />
                  </>
                )}
              </svg>
              <span>{s.label?.trim() || `سری ${toPersianDigits(i + 1)}`}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.plotWrap}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby={`${heading ? `${titleId} ` : ''}${descId}`}
        >
          <desc id={descId}>{summary}</desc>
          {isBar ? (
            <defs>
              {/* Texture, so the bars stay distinguishable in greyscale print
                  and in Windows forced-colors mode. Series 1 stays solid. */}
              {series.map((_, i) =>
                i === 0 ? null : (
                  <pattern
                    key={i}
                    id={`${idBase}-hatch-${i}`}
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform={`rotate(${i === 1 ? 45 : 135})`}
                  >
                    <rect width="6" height="6" fill={SERIES_COLORS[i]} opacity="0.28" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke={SERIES_COLORS[i]} strokeWidth="3.5" />
                  </pattern>
                ),
              )}
            </defs>
          ) : null}

          {/* Recessive grid — the data has to be the loudest thing here. */}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PLOT_START}
                x2={PLOT_END}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
              <text x={PLOT_END + 10} y={yOf(t) + 4} className={styles.axisText} textAnchor="start">
                {faNumber(t)}
              </text>
            </g>
          ))}
          {scale.min < 0 && scale.max > 0 ? (
            <line x1={PLOT_START} x2={PLOT_END} y1={zeroY} y2={zeroY} stroke="var(--chart-axis)" strokeWidth="1" />
          ) : null}

          {isBar
            ? series.map((s, si) => {
                const groupW = band * 0.68;
                const barW = Math.max(3, groupW / series.length - 2);
                return (
                  <g key={si}>
                    {s.values.map((v, i) => {
                      if (v === null || v === undefined || !Number.isFinite(v)) return null;
                      const center = centerOf(i);
                      // Series read right-to-left inside the group too.
                      const x = center + groupW / 2 - (si + 1) * (barW + 2) + 1;
                      const y = Math.min(yOf(v), zeroY);
                      const h = Math.abs(yOf(v) - zeroY);
                      const d = barPath(x, y, barW, h, v >= 0);
                      if (!d) return null;
                      return (
                        <path
                          key={i}
                          d={d}
                          fill={si === 0 ? SERIES_COLORS[si] : `url(#${idBase}-hatch-${si})`}
                          stroke={SERIES_COLORS[si]}
                          strokeWidth={si === 0 ? 0 : 1}
                        />
                      );
                    })}
                  </g>
                );
              })
            : series.map((s, si) => {
                // A missing month is a GAP, never a zero and never a straight
                // line through it — so the path restarts after every null.
                const segments: string[] = [];
                let open = false;
                s.values.forEach((v, i) => {
                  if (v === null || v === undefined || !Number.isFinite(v)) {
                    open = false;
                    return;
                  }
                  segments.push(`${open ? 'L' : 'M'} ${pointOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`);
                  open = true;
                });
                return (
                  <g key={si}>
                    <path
                      d={segments.join(' ')}
                      fill="none"
                      stroke={SERIES_COLORS[si]}
                      strokeWidth="2"
                      strokeDasharray={SERIES_DASH[si]}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {s.values.map((v, i) =>
                      v === null || v === undefined || !Number.isFinite(v) ? null : (
                        <path
                          key={i}
                          d={markerPath(SERIES_SHAPE[si]!, pointOf(i), yOf(v))}
                          fill={SERIES_COLORS[si]}
                          // A 2px surface-coloured ring keeps overlapping
                          // markers from merging into one blob.
                          stroke="var(--color-surface)"
                          strokeWidth="2"
                        />
                      ),
                    )}
                  </g>
                );
              })}

          <line
            x1={PLOT_START}
            x2={PLOT_END}
            y1={PLOT_BOTTOM}
            y2={PLOT_BOTTOM}
            stroke="var(--chart-axis)"
            strokeWidth="1"
            shapeRendering="crispEdges"
          />
          {labels.map((label, i) =>
            i % labelStride === 0 ? (
              <text
                key={i}
                x={isBar ? centerOf(i) : pointOf(i)}
                y={PLOT_BOTTOM + 22}
                className={styles.axisText}
                textAnchor="middle"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {attrs.source?.trim() ? <p className={styles.source}>منبع: {attrs.source.trim()}</p> : null}

      {/* WCAG 1.1.1 — the numbers themselves, not just a trend summary. This
          is also what relieves the amber series' sub-3:1 contrast on a white
          surface: no value here is available only by looking at a colour. */}
      <details className={styles.dataToggle}>
        <summary>جدول داده‌های نمودار</summary>
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <caption className="visually-hidden">{summary}</caption>
            <thead>
              <tr>
                <th scope="col">دسته</th>
                {series.map((s, i) => (
                  <th key={i} scope="col">
                    {s.label?.trim() || `سری ${toPersianDigits(i + 1)}`}
                    {unit ? <span className={styles.unit}> ({unit})</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={i}>
                  <th scope="row">{label || 'نامشخص'}</th>
                  {series.map((s, si) => {
                    const v = s.values[i];
                    return (
                      <td key={si} className="tnum">
                        {v === null || v === undefined || !Number.isFinite(v) ? 'نامشخص' : faNumber(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
