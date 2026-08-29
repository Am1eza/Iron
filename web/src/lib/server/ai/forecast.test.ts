/**
 * The forecast arithmetic.
 *
 * This is the one tool in the advisor whose output a customer might act on
 * with money, and the one place a long-standing prompt rule («هرگز پیش‌بینی
 * قطعی نده») was deliberately relaxed. So the tests are written against the
 * SAFETY properties first and the maths second: it must refuse when it has no
 * history, it must never claim a direction its own band contradicts, it must
 * never emit an absolute price, and a driver that does not actually correlate
 * must not be allowed to explain anything.
 */
import { describe, it, expect } from 'vitest';
import {
  computeForecast,
  correlation,
  returns,
  slopePerStepPct,
  stdev,
  FLAT_THRESHOLD_PCT,
  HORIZON_LABEL,
  MIN_HISTORY_POINTS,
} from './forecast';

/** A clean series: `n` points compounding at `pctPerDay`. Its daily returns
 *  are CONSTANT by construction, which is fine for trend/direction tests and
 *  deliberately not used for correlation ones — a series with no variance in
 *  its returns has nothing to correlate, and any r computed against it is
 *  measuring rounding noise. See `walk`. */
function ramp(n: number, start = 40_000, pctPerDay = 0): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push(Math.round(v));
    v *= 1 + pctPerDay / 100;
  }
  return out;
}

/** Deterministic pseudo-noise in [−1, 1] — a fixed LCG, so a correlation test
 *  is reproducible to the digit and can never flake. */
function jitter(i: number): number {
  const x = Math.sin((i + 1) * 12.9898) * 43_758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** A drifting series with real day-to-day variation — what actual price data
 *  looks like, and the only shape a correlation is meaningful over. */
function walk(n: number, start = 40_000, driftPct = 0, volPct = 1): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push(Math.round(v));
    v *= 1 + (driftPct + jitter(i) * volPct) / 100;
  }
  return out;
}

/** A deterministic zig-zag around a level — volatile, but going nowhere. */
function choppy(n: number, base = 40_000, ampPct = 4): number[] {
  return Array.from({ length: n }, (_, i) => Math.round(base * (1 + ((i % 2 ? 1 : -1) * ampPct) / 100)));
}

describe('returns', () => {
  it('is day-over-day, one shorter than the input', () => {
    expect(returns([100, 110, 121])).toEqual([0.1, 0.1]);
  });

  it('drops a non-positive baseline instead of producing Infinity', () => {
    expect(returns([0, 100, 110])).toEqual([0.1]);
    expect(returns([100, 110]).every(Number.isFinite)).toBe(true);
  });
});

describe('correlation', () => {
  it('is 1 for identical movement and −1 for mirrored movement', () => {
    const a = [0.01, -0.02, 0.03, -0.01, 0.02];
    expect(correlation(a, a)).toBeCloseTo(1, 6);
    expect(correlation(a, a.map((v) => -v))).toBeCloseTo(-1, 6);
  });

  it('is 0 — never NaN — when one side never moves', () => {
    // A hand-entered driver that has not changed all month genuinely tells us
    // nothing; NaN here would propagate into the band and out to a customer.
    expect(correlation([0.01, 0.02, -0.01], [0, 0, 0])).toBe(0);
    expect(Number.isNaN(correlation([0.01, 0.02, -0.01], [0, 0, 0]))).toBe(false);
  });

  it('aligns from the END, so a longer driver history does not shift time', () => {
    const product = [0.01, -0.01, 0.02];
    const driverLong = [0.5, -0.4, 0.9, 0.01, -0.01, 0.02]; // last 3 match exactly
    expect(correlation(product, driverLong)).toBeCloseTo(1, 6);
  });

  it('declines to correlate two or fewer points', () => {
    expect(correlation([0.01, 0.02], [0.01, 0.02])).toBe(0);
  });
});

describe('slopePerStepPct', () => {
  it('reads a steady climb as a positive drift', () => {
    expect(slopePerStepPct(ramp(20, 40_000, 1))).toBeGreaterThan(0.5);
  });

  it('reads the whole shape, not just the endpoints', () => {
    // IDENTICAL first and last values, opposite stories. The straight climb is
    // genuinely trending up; the spike-then-fade spent the window coming back
    // down and must not be reported as the same trend. Only a fitted slope can
    // tell them apart — «last minus first» cannot, by construction.
    const straight = [40_000, 40_500, 41_000, 41_500, 42_000, 42_500, 43_000, 43_500, 44_000];
    const spikeThenFade = [40_000, 47_000, 46_500, 46_000, 45_500, 45_000, 44_800, 44_400, 44_000];
    expect(straight[0]).toBe(spikeThenFade[0]);
    expect(straight.at(-1)).toBe(spikeThenFade.at(-1));
    expect(slopePerStepPct(spikeThenFade)).toBeLessThan(slopePerStepPct(straight));
  });

  it('is 0 for a flat line and for a single point', () => {
    expect(slopePerStepPct([100, 100, 100])).toBe(0);
    expect(slopePerStepPct([100])).toBe(0);
  });
});

describe('stdev', () => {
  it('is 0 for a constant series and positive for a moving one', () => {
    expect(stdev([5, 5, 5])).toBe(0);
    expect(stdev([1, 2, 3])).toBeGreaterThan(0);
  });
});

describe('computeForecast — refusing rather than guessing', () => {
  it('returns null below the minimum history, however tempting the shape', () => {
    const barely = ramp(MIN_HISTORY_POINTS - 1, 40_000, 3);
    expect(computeForecast({ series: barely })).toBeNull();
  });

  it('answers as soon as it has the minimum', () => {
    expect(computeForecast({ series: ramp(MIN_HISTORY_POINTS, 40_000, 1) })).not.toBeNull();
  });

  it('ignores zero and negative prices rather than letting them skew the call', () => {
    const dirty = [0, -1, ...ramp(12, 40_000, 1)];
    const clean = computeForecast({ series: ramp(12, 40_000, 1) })!;
    const result = computeForecast({ series: dirty })!;
    expect(result.basedOnDays).toBe(clean.basedOnDays);
    expect(result.direction).toBe(clean.direction);
  });
});

describe('computeForecast — direction', () => {
  it('calls a sustained climb up', () => {
    const r = computeForecast({ series: ramp(30, 40_000, 0.5) })!;
    expect(r.direction).toBe('up');
    expect(r.ownChangePct).toBeGreaterThan(0);
  });

  it('calls a sustained slide down', () => {
    const r = computeForecast({ series: ramp(30, 40_000, -0.5) })!;
    expect(r.direction).toBe('down');
    expect(r.ownChangePct).toBeLessThan(0);
  });

  it('calls a flat market flat instead of inventing a lean', () => {
    const r = computeForecast({ series: ramp(30, 40_000, 0) })!;
    expect(r.direction).toBe('flat');
    expect(Math.abs(r.signalPct)).toBeLessThanOrEqual(FLAT_THRESHOLD_PCT);
  });

  it('calls a volatile-but-going-nowhere market flat, with a wide band', () => {
    const r = computeForecast({ series: choppy(30) })!;
    expect(r.direction).toBe('flat');
    // Volatility must show up as width, not as a direction.
    expect(r.bandHighPct - r.bandLowPct).toBeGreaterThan(8);
  });
});

describe('computeForecast — the band is the honesty', () => {
  it('always brackets its own centre', () => {
    const r = computeForecast({ series: ramp(30, 40_000, 0.6) })!;
    expect(r.bandLowPct).toBeLessThanOrEqual(r.signalPct);
    expect(r.bandHighPct).toBeGreaterThanOrEqual(r.signalPct);
    expect(r.bandLowPct).toBeLessThanOrEqual(r.bandHighPct);
  });

  it('is wider for a jumpy product than for a smooth one moving the same way', () => {
    const smooth = computeForecast({ series: ramp(30, 40_000, 0.5) })!;
    const jumpy = computeForecast({
      series: ramp(30, 40_000, 0.5).map((v, i) => Math.round(v * (1 + ((i % 2 ? 3 : -3) / 100)))),
    })!;
    expect(jumpy.bandHighPct - jumpy.bandLowPct).toBeGreaterThan(smooth.bandHighPct - smooth.bandLowPct);
  });

  it('never projects an absurd move, however violent the sample', () => {
    const spike = ramp(30, 40_000, 12); // +12% a day for a month
    const r = computeForecast({ series: spike })!;
    expect(r.bandHighPct).toBeLessThanOrEqual(25);
    expect(r.bandLowPct).toBeGreaterThanOrEqual(-25);
  });

  it('emits percentages only — never anything that could read as a price', () => {
    const r = computeForecast({ series: ramp(30, 41_500, 0.5) })!;
    const serialized = JSON.stringify(r);
    // The single most important structural guarantee: no Toman figure for a
    // future date exists anywhere in this output, so the model has none to
    // quote even if it is asked to.
    expect(serialized).not.toContain('41500');
    expect(Math.abs(r.bandLowPct)).toBeLessThanOrEqual(25);
    expect(Math.abs(r.bandHighPct)).toBeLessThanOrEqual(25);
    expect(r.horizonLabel).toBe(HORIZON_LABEL);
  });
});

describe('computeForecast — drivers', () => {
  // A real-looking climb: upward drift WITH day-to-day variation, so its
  // returns have the variance a correlation needs to mean anything.
  const climbing = walk(30, 40_000, 0.5, 0.8);

  it('lets a correlated driver reinforce the call and names it in the reason', () => {
    // A driver whose day-to-day returns track the product's exactly.
    const usd = climbing.map((v) => Math.round(v * 2.25));
    const r = computeForecast({
      series: climbing,
      drivers: [{ key: 'usd', label: 'دلار', values: usd }],
    })!;
    expect(r.drivers.find((d) => d.label === 'دلار')!.correlation).toBeGreaterThan(0.9);
    expect(r.reason).toContain('دلار');
    expect(r.direction).toBe('up');
  });

  it('reports an uncorrelated driver but does not let it explain anything', () => {
    // Alternating noise against a smooth climb — near-zero correlation.
    const noise = Array.from({ length: 30 }, (_, i) => 1_000 + (i % 2 ? 40 : -40));
    const r = computeForecast({
      series: climbing,
      drivers: [{ key: 'gold18', label: 'طلای ۱۸ عیار', values: noise }],
    })!;
    // Measured and shown — the card proves the tool looked.
    expect(r.drivers.map((d) => d.label)).toContain('طلای ۱۸ عیار');
    expect(Math.abs(r.drivers[0]!.correlation)).toBeLessThan(0.3);
    // …but the sentence says plainly that nothing correlated.
    expect(r.reason).toContain('همبستگی معناداری نشان نمی‌دهد');
  });

  it('does not let a driver with no usable history break the call', () => {
    const r = computeForecast({
      series: climbing,
      drivers: [
        { key: 'billet', label: 'شمش', values: [] },
        { key: 'usd', label: 'دلار', values: [90_000, 0, -5] },
      ],
    })!;
    expect(r.direction).toBe('up');
    expect(r.drivers.every((d) => Number.isFinite(d.correlation))).toBe(true);
  });

  /**
   * An inverse driver, built exactly: its daily return is `drift − r_product`,
   * so its correlation with the product is −1 by construction while its own
   * drift is whatever we choose. That separates the two things a driver
   * contributes — WHICH WAY it relates, and WHICH WAY it is going — which is
   * the whole reason the signal multiplies correlation by the driver's slope
   * instead of just adding its change.
   */
  function inverseOf(base: number[], driftPct: number): number[] {
    const out = [90_000];
    for (const r of returns(base)) out.push(Math.round(out[out.length - 1]! * (1 + driftPct / 100 - r)));
    return out;
  }

  it('an inverse driver that is RISING damps an upward call', () => {
    // The product moves opposite to the dollar, and the dollar is climbing —
    // so the dollar's own direction argues against this product rising.
    const withInverse = computeForecast({
      series: climbing,
      drivers: [{ key: 'usd', label: 'دلار', values: inverseOf(climbing, 1) }],
    })!;
    const alone = computeForecast({ series: climbing })!;
    expect(withInverse.drivers[0]!.correlation).toBeLessThan(-0.9);
    expect(withInverse.signalPct).toBeLessThan(alone.signalPct);
    expect(withInverse.reason).toContain('خلاف‌جهت');
  });

  it('…and an inverse driver that is FALLING reinforces it', () => {
    // Same relationship, opposite driver direction, opposite conclusion. If
    // this product moves against the dollar and the dollar is dropping, that
    // is a reason to expect this product UP — the sign algebra has to survive
    // both cases or the tool is only accidentally right in one of them.
    const withInverse = computeForecast({
      series: climbing,
      drivers: [{ key: 'usd', label: 'دلار', values: inverseOf(climbing, -1) }],
    })!;
    const alone = computeForecast({ series: climbing })!;
    expect(withInverse.drivers[0]!.correlation).toBeLessThan(-0.9);
    expect(withInverse.drivers[0]!.changePct).toBeLessThan(0);
    expect(withInverse.signalPct).toBeGreaterThan(alone.signalPct);
  });

  it('a driver that never moves counts as no evidence, not as calm', () => {
    const frozen = new Array(30).fill(1_000_000); // admin-entered billet, untouched
    const withFrozen = computeForecast({
      series: climbing,
      drivers: [{ key: 'billet', label: 'شمش', values: frozen }],
    })!;
    const alone = computeForecast({ series: climbing })!;
    expect(withFrozen.drivers[0]!.correlation).toBe(0);
    // The call is unchanged: an uncorrelated driver neither helps nor damps it.
    expect(withFrozen.signalPct).toBe(alone.signalPct);
  });
});

describe('computeForecast — confidence is earned, not assumed', () => {
  it('never says high without a long history AND a strong driver AND a decisive band', () => {
    const short = computeForecast({ series: ramp(10, 40_000, 0.5) })!;
    expect(short.confidence).not.toBe('high');

    const noDriver = computeForecast({ series: ramp(40, 40_000, 0.5) })!;
    expect(noDriver.confidence).not.toBe('high');
  });

  it('reaches high only when all three hold', () => {
    const series = walk(40, 40_000, 0.6, 0.8);
    const usd = series.map((v) => Math.round(v * 2.25));
    const r = computeForecast({ series, drivers: [{ key: 'usd', label: 'دلار', values: usd }] })!;
    expect(r.confidence).toBe('high');
    expect(r.bandLowPct).toBeGreaterThan(0); // decisive: the band does not straddle zero
  });

  it('drops to low when the band cannot even sign the move', () => {
    const r = computeForecast({ series: choppy(30) })!;
    expect(r.bandLowPct).toBeLessThan(0);
    expect(r.bandHighPct).toBeGreaterThan(0);
    expect(r.confidence).toBe('low');
  });

  it('a flat call is never dressed up as a confident one', () => {
    const r = computeForecast({ series: ramp(40, 40_000, 0) })!;
    expect(r.direction).toBe('flat');
    expect(r.confidence).toBe('low');
  });
});

describe('computeForecast — the sentence it hands the model', () => {
  it('is Persian, mentions the window, and never names a future price', () => {
    const r = computeForecast({ series: ramp(30, 40_000, 0.5) })!;
    expect(r.reason).toContain('روز گذشته');
    expect(r.reason).toMatch(/[؀-ۿ]/);
    expect(r.reason).not.toMatch(/تومان/);
  });

  it('says "roughly unchanged" rather than reporting a meaningless fraction', () => {
    const r = computeForecast({ series: ramp(30, 40_000, 0) })!;
    expect(r.reason).toContain('تقریباً ثابت مانده');
  });
});
