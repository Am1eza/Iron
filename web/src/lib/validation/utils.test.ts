import { describe, it, expect } from 'vitest';
import { finiteNumber, formatZodError, safeValidate } from './utils';
import { z } from 'zod';

describe('finiteNumber', () => {
  it('accepts ordinary finite numbers', () => {
    expect(finiteNumber.safeParse(0).success).toBe(true);
    expect(finiteNumber.safeParse(-42.5).success).toBe(true);
    expect(finiteNumber.safeParse(1_000_000).success).toBe(true);
  });

  it('rejects Infinity and -Infinity', () => {
    expect(finiteNumber.safeParse(Infinity).success).toBe(false);
    expect(finiteNumber.safeParse(-Infinity).success).toBe(false);
  });

  it('rejects NaN', () => {
    expect(finiteNumber.safeParse(NaN).success).toBe(false);
  });

  it('rejects a JSON-smuggled 1e400 (parses to Infinity)', () => {
    const parsed = JSON.parse('{"q":1e400}') as { q: number };
    expect(parsed.q).toBe(Infinity);
    expect(finiteNumber.safeParse(parsed.q).success).toBe(false);
  });

  it('composes with .positive().max() the way every route schema uses it', () => {
    const qty = finiteNumber.positive().max(100_000);
    expect(qty.safeParse(50).success).toBe(true);
    expect(qty.safeParse(Infinity).success).toBe(false);
    expect(qty.safeParse(100_001).success).toBe(false);
    expect(qty.safeParse(0).success).toBe(false);
  });

  it('.pipe()s cleanly after z.coerce.number() (the threshold-field pattern)', () => {
    const threshold = z.coerce.number().pipe(finiteNumber.positive().max(1e13));
    expect(threshold.safeParse('32000').success).toBe(true);
    expect(threshold.safeParse('Infinity').success).toBe(false);
    expect(threshold.safeParse('1e20').success).toBe(false);
    expect(threshold.safeParse('not-a-number').success).toBe(false);
  });
});

describe('formatZodError', () => {
  it('keeps only the first message per field', () => {
    const schema = z.object({ mobile: z.string().min(11).max(11) });
    const r = schema.safeParse({ mobile: '1' });
    if (r.success) throw new Error('expected failure');
    const errors = formatZodError(r.error);
    expect(Object.keys(errors)).toEqual(['mobile']);
  });
});

describe('safeValidate', () => {
  it('returns a discriminated ok/errors result', () => {
    const schema = z.object({ n: finiteNumber.positive() });
    expect(safeValidate(schema, { n: 5 })).toEqual({ ok: true, data: { n: 5 } });
    const bad = safeValidate(schema, { n: Infinity });
    expect(bad.ok).toBe(false);
  });
});
