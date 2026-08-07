import { describe, it, expect } from 'vitest';
import {
  freightPerTonFromTable,
  estimateLogistics,
  DEFAULT_LOGISTICS_CONFIG,
  DEFAULT_FREIGHT_TABLE,
  type LogisticsConfig,
} from './logistics';

describe('freightPerTonFromTable', () => {
  const table = [
    { km: 75, perTon: 100 },
    { km: 500, perTon: 500 },
    { km: 1000, perTon: 800 },
  ];

  it('is flat at the lowest anchor rate for anything at or below it (no unfounded extrapolation)', () => {
    expect(freightPerTonFromTable(10, table)).toBe(100);
    expect(freightPerTonFromTable(75, table)).toBe(100);
  });

  it('linearly interpolates between two real anchors', () => {
    // Halfway between 75 (100) and 500 (500) in km-space → halfway in rate too.
    expect(freightPerTonFromTable(287.5, table)).toBeCloseTo(300, 5);
  });

  it('extrapolates the last segment slope beyond the top anchor', () => {
    // Slope from 500→1000 is (800-500)/500 = 0.6/km; at 1500 → 800 + 500*0.6 = 1100.
    expect(freightPerTonFromTable(1500, table)).toBeCloseTo(1100, 5);
  });

  it('real 1405 anchors are actually tapering (marginal rate strictly decreases with distance)', () => {
    // This is the whole reason a flat Toman/km rate can't represent the real
    // tariff — confirms the shipped default table has that shape.
    const marginal = (a: number, b: number) => {
      const x = DEFAULT_FREIGHT_TABLE.find((f) => f.km === a)!;
      const y = DEFAULT_FREIGHT_TABLE.find((f) => f.km === b)!;
      return (y.perTon - x.perTon) / (y.km - x.km);
    };
    const early = marginal(75, 500);
    const late = marginal(1000, 2000);
    expect(late).toBeLessThan(early);
  });
});

describe('estimateLogistics', () => {
  it('uses the tapered freightTable when present', () => {
    const cfg: LogisticsConfig = { ...DEFAULT_LOGISTICS_CONFIG, freightTable: [{ km: 100, perTon: 1000 }] };
    const est = estimateLogistics(10, 100, 1_000_000, 0.1, cfg);
    expect(est.freight).toBe(10_000); // 10 tons * 1000 Toman/ton
  });

  it('falls back to the legacy flat-rate formula for a settings row saved before the freightTable existed', () => {
    const legacyCfg: LogisticsConfig = {
      originLabel: 'x',
      freightTable: [],
      freightRatePerTonKm: 1100,
      freightMinTrip: 2_500_000,
      handlingPerTon: 150_000,
      insuranceRate: 0.0025,
      scaleFee: 75_000,
      cities: [],
    };
    const est = estimateLogistics(10, 15, 1_000_000, 0.1, legacyCfg);
    // max(2_500_000, 10*15*1100=165_000) → the minimum-trip floor wins, exactly
    // like the pre-upgrade formula.
    expect(est.freight).toBe(2_500_000);
  });

  it('defaults to DEFAULT_LOGISTICS_CONFIG when no config is passed at all', () => {
    const est = estimateLogistics(10, 1000, 50_000_000, 0.1);
    expect(est.freight).toBeGreaterThan(0);
    expect(est.total).toBeGreaterThan(50_000_000);
  });
});
