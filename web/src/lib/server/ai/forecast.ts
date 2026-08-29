/**
 * Directional price outlook — «چشم‌انداز قیمت», never a price for a date.
 *
 * ── WHY THIS IS ALLOWED AT ALL ────────────────────────────────────────────
 * The advisor's prompt has always said «دربارهٔ آیندهٔ قیمت هرگز پیش‌بینی قطعی
 * نده». That rule exists for a good reason and it is not being relaxed: a
 * confident «فردا ۴۳٬۵۰۰ تومان» from an assistant a buyer trusts is worse than
 * silence, because they will act on it and the data underneath cannot support
 * it. But «هیچ چیز نمی‌گویم» is also wrong. Every steel buyer in this market
 * asks the same question before committing to a tonnage — بخرم یا صبر کنم؟ —
 * and a broker who refuses to have a view is not being careful, they are being
 * useless. What a real one says is «بازار رو به بالاست، دلار هم بالا رفته، اگر
 * می‌توانی امروز ببند», with the reasoning attached.
 *
 * So this module produces exactly that shape and structurally cannot produce
 * any other:
 *
 *   - The output is a DIRECTION (up/down/flat) plus a band in PERCENT. There
 *     is no code path here that emits an absolute Toman figure for a future
 *     date, so the model has none to quote even if it tries.
 *   - The band is derived from the product's own realized volatility, so a
 *     jumpy product gets a visibly wide, visibly uncertain band rather than a
 *     falsely precise one.
 *   - It REFUSES below `MIN_HISTORY_POINTS`. A product priced three times has
 *     no trend, and inventing one is the exact failure mode the old blanket
 *     ban was protecting against.
 *   - Confidence is reported, and reaching `high` requires both a long
 *     history AND a strongly correlated driver AND a band that does not
 *     straddle zero. Most real calls will read `medium` or `low`, which is
 *     honest.
 *
 * ── WHAT IT READS ─────────────────────────────────────────────────────────
 * The product's own daily closes (`price_points`, the series the product
 * page's chart is drawn from) and the market drivers the ticker already polls
 * (`market_points`: dollar, 18k gold, billet). Correlation is computed on
 * DAILY RETURNS, not on levels: two series that both drift upward over a
 * quarter correlate near 1.0 on levels no matter how unrelated they are, which
 * would let any rising number "explain" any other. Returns ask the question
 * that actually matters — when the dollar moves, does this product move?
 *
 * Pure functions, no I/O: the caller does the repo reads. That is what makes
 * the arithmetic testable, and this is the one tool in the advisor whose
 * arithmetic a customer might act on.
 */
import type { ForecastConfidence, ForecastDirection, ForecastDriver } from '@/lib/ai/blocks';

/** Below this many daily closes there is no trend to read, and the tool says
 *  so rather than extrapolating from three points. */
export const MIN_HISTORY_POINTS = 8;

/** How far ahead the call looks. Two weeks is the horizon a buyer is actually
 *  deciding over («بخرم یا هفتهٔ دیگر؟») and the furthest this data supports. */
export const HORIZON_DAYS = 14;
export const HORIZON_LABEL = '۱ تا ۲ هفتهٔ آینده';

/** A driver whose returns correlate less than this with the product's is not
 *  evidence; it is noise that happens to be in the same room. Such drivers are
 *  still REPORTED on the card (with their real correlation, so the reader can
 *  see the tool looked and found nothing) but contribute nothing to the call. */
export const MIN_CORRELATION = 0.3;

/** Inside this band the honest answer is «flat». Steel repricing in this
 *  market moves in whole percent, so a projected half-percent drift over two
 *  weeks is not a direction, it is rounding. */
export const FLAT_THRESHOLD_PCT = 1;

/** The product's own trend against the drivers' pull. Its own recent behaviour
 *  is the stronger evidence — the drivers explain WHY, and modulate. */
const OWN_WEIGHT = 0.6;
const DRIVER_WEIGHT = 0.4;

/** Nothing here may claim a move larger than this over two weeks, whatever the
 *  arithmetic says. A short violent stretch can extrapolate to absurdity, and
 *  an absurd band is read as a broken tool rather than as a wide one. */
const MAX_ABS_PCT = 25;
/** …and never a band so tight it reads as precision this cannot have. */
const MIN_BAND_HALF_PCT = 1;
const MAX_BAND_HALF_PCT = 12;

export interface ForecastDriverInput {
  /** Ticker key — `usd`, `gold18`, `billet`. */
  key: string;
  /** Persian label for the card. */
  label: string;
  /** Daily closes, ascending, same cadence as the product series. */
  values: number[];
}

export interface ForecastInput {
  /** The product's own daily closes, ascending. */
  series: number[];
  drivers?: ForecastDriverInput[];
}

export interface ForecastResult {
  direction: ForecastDirection;
  confidence: ForecastConfidence;
  bandLowPct: number;
  bandHighPct: number;
  horizonLabel: string;
  reason: string;
  drivers: ForecastDriver[];
  basedOnDays: number;
  ownChangePct: number;
  /** The centre of the band — exposed for tests and telemetry, not for display:
   *  showing a single projected percent invites reading it as a number. */
  signalPct: number;
}

/* --------------------------------------------------------------- helpers -- */

/** Day-over-day returns. A non-positive baseline yields no return rather than
 *  an Infinity that would poison every statistic downstream. */
export function returns(values: ReadonlyArray<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
    out.push((cur - prev) / prev);
  }
  return out;
}

/**
 * Pearson correlation, −1…1. Zero variance on either side returns 0, not NaN:
 * an admin-entered driver that has not moved all month genuinely tells us
 * nothing, and NaN would propagate into the band and out to a customer.
 */
export function correlation(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  // Align from the END: both series are daily closes ending "now", and a
  // driver polled for longer must not shift the product's series backwards
  // in time relative to it.
  const xs = a.slice(a.length - n);
  const ys = b.slice(b.length - n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a1 = xs[i]! - mx;
    const b1 = ys[i]! - my;
    num += a1 * b1;
    dx += a1 * a1;
    dy += b1 * b1;
  }
  if (dx === 0 || dy === 0) return 0;
  const r = num / Math.sqrt(dx * dy);
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
}

/** Sample standard deviation. Fewer than two points has no spread. */
export function stdev(values: ReadonlyArray<number>): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Least-squares drift per step, as a FRACTION of the series mean.
 *
 * Regression rather than «last minus first»: a product that ran up 8% and gave
 * half of it back has an endpoint change of 4% and a visibly flattening trend,
 * and only the fitted slope can tell those apart. Normalising by the mean makes
 * the slope scale-free so a 42,000 Toman rebar and a 900 dollar ounce are
 * directly comparable.
 */
export function slopePerStepPct(values: ReadonlyArray<number>): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean <= 0) return 0;
  const mx = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (values[i]! - mean);
    den += (i - mx) ** 2;
  }
  if (den === 0) return 0;
  return ((num / den) / mean) * 100;
}

/** Net change across a window, percent. */
function netChangePct(values: ReadonlyArray<number>): number {
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (!Number.isFinite(first) || first <= 0) return 0;
  return ((last - first) / first) * 100;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** «۳٫۲ درصد» — Persian digits with the Persian decimal separator. */
function pct(n: number): string {
  const s = Math.abs(round1(n)).toFixed(1).replace(/\.0$/, '');
  return `${s.replace('.', '٫')} درصد`;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function fa(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!);
}

/* ---------------------------------------------------------------- compute -- */

/**
 * The call itself.
 *
 * Returns null — not a hedged guess — when there is not enough history. The
 * caller turns that into «سابقهٔ کافی نداریم», which is a real answer.
 */
export function computeForecast(input: ForecastInput): ForecastResult | null {
  const series = input.series.filter((v) => Number.isFinite(v) && v > 0);
  if (series.length < MIN_HISTORY_POINTS) return null;

  const ownReturns = returns(series);
  if (ownReturns.length < 2) return null;

  const ownChangePct = netChangePct(series);
  const ownSlopePct = slopePerStepPct(series);
  const ownSignalPct = clamp(ownSlopePct * HORIZON_DAYS, -MAX_ABS_PCT, MAX_ABS_PCT);

  // Every driver is measured and REPORTED; only sufficiently correlated ones
  // are allowed to move the call. Showing an uncorrelated driver with its real
  // r is the point — it demonstrates the tool checked.
  const measured = (input.drivers ?? [])
    .map((d) => {
      const values = d.values.filter((v) => Number.isFinite(v) && v > 0);
      if (values.length < 3) return null;
      const r = correlation(ownReturns, returns(values));
      return {
        key: d.key,
        label: d.label,
        changePct: round1(netChangePct(values)),
        correlation: Math.round(r * 100) / 100,
        slopePct: slopePerStepPct(values),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const used = measured.filter((d) => Math.abs(d.correlation) >= MIN_CORRELATION);
  const driverSignalPct = used.length
    ? clamp(
        used.reduce((s, d) => s + d.correlation * d.slopePct * HORIZON_DAYS, 0) / used.length,
        -MAX_ABS_PCT,
        MAX_ABS_PCT,
      )
    : 0;

  // With no usable driver the product's own trend carries the whole call
  // rather than being scaled down by a driver term that is only zero because
  // nothing correlated — otherwise "we found no driver" would silently read
  // as "the market is calm".
  const signalPct = clamp(
    used.length ? OWN_WEIGHT * ownSignalPct + DRIVER_WEIGHT * driverSignalPct : ownSignalPct,
    -MAX_ABS_PCT,
    MAX_ABS_PCT,
  );

  // Realized daily volatility, scaled to the horizon by √t — the standard
  // random-walk scaling, and the reason a jumpy product gets a visibly wider
  // band than a stable one instead of the same cosmetic ±2%.
  const dailyVolPct = stdev(ownReturns) * 100;
  const half = clamp(dailyVolPct * Math.sqrt(HORIZON_DAYS), MIN_BAND_HALF_PCT, MAX_BAND_HALF_PCT);

  const direction: ForecastDirection =
    signalPct > FLAT_THRESHOLD_PCT ? 'up' : signalPct < -FLAT_THRESHOLD_PCT ? 'down' : 'flat';

  const bandLowPct = round1(clamp(signalPct - half, -MAX_ABS_PCT, MAX_ABS_PCT));
  const bandHighPct = round1(clamp(signalPct + half, -MAX_ABS_PCT, MAX_ABS_PCT));

  // A band that straddles zero means the tool cannot even sign the move. That
  // is the single most important input to how loudly this may be stated.
  const decisive = bandLowPct > 0 || bandHighPct < 0;
  const strongest = [...used].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))[0];
  const confidence: ForecastConfidence =
    decisive && series.length >= 30 && strongest && Math.abs(strongest.correlation) >= 0.6
      ? 'high'
      : decisive && series.length >= 14
        ? 'medium'
        : 'low';

  return {
    direction,
    confidence,
    bandLowPct,
    bandHighPct,
    horizonLabel: HORIZON_LABEL,
    reason: buildReason({ direction, ownChangePct, basedOnDays: series.length, strongest, used }),
    drivers: measured.map(({ label, changePct, correlation: r }) => ({ label, changePct, correlation: r })),
    basedOnDays: series.length,
    ownChangePct: round1(ownChangePct),
    signalPct: round1(signalPct),
  };
}

/* ----------------------------------------------------------------- prose --- */

const DIR_WORD: Record<ForecastDirection, string> = {
  up: 'رو به بالا',
  down: 'رو به پایین',
  flat: 'کم‌نوسان',
};

/**
 * The one-line «چرا». Assembled from the same numbers the card shows, in code,
 * so the model never has to author the reasoning — it only relays it. Every
 * figure in this sentence is therefore also in the tool result, and so in the
 * grounding ledger, which is what lets the model quote it without being
 * censored.
 */
function buildReason(args: {
  direction: ForecastDirection;
  ownChangePct: number;
  basedOnDays: number;
  strongest?: { label: string; changePct: number; correlation: number };
  used: ReadonlyArray<{ label: string }>;
}): string {
  const { direction, ownChangePct, basedOnDays, strongest } = args;
  const moved =
    Math.abs(round1(ownChangePct)) < 0.5
      ? `قیمت این محصول در ${fa(basedOnDays)} روز گذشته تقریباً ثابت مانده`
      : `قیمت این محصول در ${fa(basedOnDays)} روز گذشته ${pct(ownChangePct)} ${
          ownChangePct > 0 ? 'بالا رفته' : 'پایین آمده'
        }`;

  if (!strongest) {
    return `${moved} و با شاخص‌های بازار (دلار، طلا، شمش) همبستگی معناداری نشان نمی‌دهد؛ بنابراین جهت کوتاه‌مدت فقط از روند خودش خوانده شده و ${DIR_WORD[direction]} است.`;
  }
  const driverMoved =
    Math.abs(strongest.changePct) < 0.5
      ? 'تقریباً ثابت بوده'
      : `${pct(strongest.changePct)} ${strongest.changePct > 0 ? 'بالا رفته' : 'پایین آمده'}`;
  const sign = strongest.correlation >= 0 ? 'هم‌جهت' : 'خلاف‌جهت';
  return `${moved} و در همین بازه ${sign} با ${strongest.label} حرکت کرده که خودش ${driverMoved}؛ روی هم، جهت کوتاه‌مدت ${DIR_WORD[direction]} به نظر می‌رسد.`;
}
