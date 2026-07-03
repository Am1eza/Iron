import { describe, it, expect } from 'vitest';
import { runTool } from './aiTools';

type WeightResult = { unitWeightKg: number; totalWeightKg: number };
type ErrorResult = { error: string };

async function calcWeight(args: Record<string, unknown>): Promise<WeightResult | ErrorResult> {
  return (await runTool('calcWeight', args, null)) as WeightResult | ErrorResult;
}

describe('calcWeight — full 7-category coverage', () => {
  it('rebar (pre-existing, default 12m branch length unchanged)', async () => {
    const r = (await calcWeight({ shape: 'rebar', diameterMm: 14, qty: 1 })) as WeightResult;
    expect(r.unitWeightKg).toBeCloseTo(14.52, 1); // 14²/162 × 12
  });

  it('wire: round-rod physics identical to rebar, length required (no default)', async () => {
    const r = (await calcWeight({ shape: 'wire', diameterMm: 6, lengthM: 100, qty: 1 })) as WeightResult;
    expect(r.unitWeightKg).toBeCloseTo(22.22, 1); // 6²/162 × 100
  });

  it('wire without lengthM → error, never guesses a coil length', async () => {
    const r = (await calcWeight({ shape: 'wire', diameterMm: 6, qty: 1 })) as ErrorResult;
    expect(r.error).toBeTruthy();
  });

  it('angle (equal leg): t·(2a−t)·0.00785 per meter, standard steel-industry formula', async () => {
    const r = (await calcWeight({ shape: 'angle', legMm: 50, thicknessMm: 5, lengthM: 6, qty: 1 })) as WeightResult;
    // area = 5*(100-5)=475mm² -> 475*7.85/1000=3.72875 kg/m -> *6m
    expect(r.unitWeightKg).toBeCloseTo(22.37, 1);
  });

  it('ibeam: تیرآهن ۱۴ (IPE140) against the published EN 10025 table', async () => {
    const r = (await calcWeight({ shape: 'ibeam', sizeCode: 14, lengthM: 12, qty: 1 })) as WeightResult;
    expect(r.unitWeightKg).toBeCloseTo(157.2, 0); // 13.1 kg/m × 12m
  });

  it('channel: ناودانی ۱۰ (UNP100) against the published EN 10025 table', async () => {
    const r = (await calcWeight({ shape: 'channel', sizeCode: 10, lengthM: 6, qty: 1 })) as WeightResult;
    expect(r.unitWeightKg).toBeCloseTo(64.8, 1); // 10.8 kg/m × 6m
  });

  it('an ibeam/channel size outside the verified table errors rather than guessing', async () => {
    const r1 = (await calcWeight({ shape: 'ibeam', sizeCode: 45, lengthM: 12, qty: 1 })) as ErrorResult;
    expect(r1.error).toBeTruthy();
    const r2 = (await calcWeight({ shape: 'channel', sizeCode: 4, lengthM: 6, qty: 1 })) as ErrorResult;
    expect(r2.error).toBeTruthy();
  });

  it('ibeam/channel without lengthM → error, never assumes a standard bar length', async () => {
    const r = (await calcWeight({ shape: 'ibeam', sizeCode: 14, qty: 1 })) as ErrorResult;
    expect(r.error).toBeTruthy();
  });

  it('total weight scales with qty for the new shapes too', async () => {
    const r = (await calcWeight({ shape: 'ibeam', sizeCode: 14, lengthM: 12, qty: 3 })) as WeightResult;
    expect(r.totalWeightKg).toBeCloseTo(r.unitWeightKg * 3, 1);
  });

  it('unknown shape enum value is rejected by zod, not silently computed', async () => {
    const r = (await calcWeight({ shape: 'nonsense', qty: 1 })) as ErrorResult;
    expect(r.error).toBeTruthy();
  });
});
