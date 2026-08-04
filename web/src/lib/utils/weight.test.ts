import { describe, it, expect } from 'vitest';
import { unitWeightKg, STEEL_DENSITY, IBEAM_KG_PER_M, CHANNEL_KG_PER_M } from './weight';

/**
 * These are REGRESSION PINS, not fresh derivations.
 *
 * Every expected value below is the arithmetic that `POST /api/tools/weight`,
 * `aiTools.weight()` and `WeightCalculator` were already producing before
 * they were collapsed into one module. Weight × unit price is the پیش‌فاکتور
 * total a customer is quoted and a human then closes on, so consolidation was
 * only allowed to remove duplication — never to move a number. If one of
 * these fails, a quote changed.
 */
describe('unitWeightKg — pinned to the previously shipping formulas', () => {
  it('rebar: d²/162 per metre, default 12 m branch', () => {
    // The exact expression the old route handler evaluated.
    expect(unitWeightKg('rebar', { diameterMm: 14 })).toBe(((14 * 14) / 162) * 12);
    expect(unitWeightKg('rebar', { diameterMm: 14 })).toBeCloseTo(14.52, 2);
    expect(unitWeightKg('rebar', { diameterMm: 20, lengthM: 6 })).toBe(((20 * 20) / 162) * 6);
  });

  it('wire: same physics as rebar but NO default length', () => {
    expect(unitWeightKg('wire', { diameterMm: 6, lengthM: 100 })).toBe(((6 * 6) / 162) * 100);
    // A coil has no standard branch length — refuse rather than assume 12 m.
    expect(unitWeightKg('wire', { diameterMm: 6 })).toBeNull();
  });

  it('plate: t(mm) × w(m) × l(m) × 7.85', () => {
    expect(unitWeightKg('plate', { thicknessMm: 3, widthM: 1.25, lengthM: 6 })).toBe(
      3 * 1.25 * 6 * STEEL_DENSITY,
    );
    expect(unitWeightKg('plate', { thicknessMm: 3, widthM: 1.25 })).toBeNull();
  });

  it('pipe: (D − t) × t × 0.02466 per metre, default 6 m', () => {
    expect(unitWeightKg('pipe', { outerDiameterMm: 60, thicknessMm: 3 })).toBe(
      (60 - 3) * 3 * 0.02466 * 6,
    );
    expect(unitWeightKg('pipe', { outerDiameterMm: 60, thicknessMm: 3, lengthM: 12 })).toBe(
      (60 - 3) * 3 * 0.02466 * 12,
    );
  });

  // The one deliberate behaviour change: the API used to answer an impossible
  // geometry with a NEGATIVE weight (t >= D), which would have gone onto a
  // proforma as a negative line. The UI calculator already rejected it.
  it('pipe: refuses a wall at least as thick as the outer diameter', () => {
    expect(unitWeightKg('pipe', { outerDiameterMm: 20, thicknessMm: 20, lengthM: 6 })).toBeNull();
    expect(unitWeightKg('pipe', { outerDiameterMm: 20, thicknessMm: 25, lengthM: 6 })).toBeNull();
  });

  it('box: perimeter(m) × t(mm) × 7.85 per metre, default 6 m', () => {
    expect(unitWeightKg('box', { widthMm: 40, heightMm: 40, thicknessMm: 2 })).toBe(
      (((40 + 40) * 2) / 1000) * 2 * STEEL_DENSITY * 6,
    );
  });

  it('angle: t·(2a − t) × 7.85/1000 per metre, length required', () => {
    expect(unitWeightKg('angle', { legMm: 50, thicknessMm: 5, lengthM: 6 })).toBe(
      5 * (2 * 50 - 5) * (STEEL_DENSITY / 1000) * 6,
    );
    expect(unitWeightKg('angle', { legMm: 50, thicknessMm: 5 })).toBeNull();
  });

  // تسمه — a flat bar, NOT the angle section. The وزن‌سنج page has always
  // quoted w × t × 0.00785 here; merging it into `angle` would have silently
  // changed a number customers already act on.
  it('flat (تسمه) stays a separate section from angle', () => {
    expect(unitWeightKg('flat', { widthMm: 40, thicknessMm: 4, lengthM: 6 })).toBe(
      40 * 4 * (STEEL_DENSITY / 1000) * 6,
    );
    expect(unitWeightKg('flat', { widthMm: 40, thicknessMm: 4, lengthM: 6 })).not.toBe(
      unitWeightKg('angle', { legMm: 40, thicknessMm: 4, lengthM: 6 }),
    );
  });

  it('ibeam/channel: mill table × length, null for a size not in the table', () => {
    expect(unitWeightKg('ibeam', { sizeCode: 14, lengthM: 12 })).toBe(IBEAM_KG_PER_M['14']! * 12);
    expect(unitWeightKg('channel', { sizeCode: 10, lengthM: 6 })).toBe(CHANNEL_KG_PER_M['10']! * 6);
    // ناودانی ۶ is below UNP80 — absent from the published table, so null
    // rather than a guessed number on a quote.
    expect(unitWeightKg('channel', { sizeCode: 6, lengthM: 6 })).toBeNull();
    expect(unitWeightKg('ibeam', { sizeCode: 14 })).toBeNull();
  });

  it('returns null for every shape when the required dimensions are missing', () => {
    expect(unitWeightKg('rebar', {})).toBeNull();
    expect(unitWeightKg('plate', {})).toBeNull();
    expect(unitWeightKg('pipe', {})).toBeNull();
    expect(unitWeightKg('box', {})).toBeNull();
    expect(unitWeightKg('flat', {})).toBeNull();
  });
});
