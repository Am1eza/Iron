import { describe, it, expect } from 'vitest';
import { finiteNumber, formatZodError, internalPathSchema } from './utils';
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

describe('internalPathSchema — off-site values (security regression)', () => {
  const s = internalPathSchema(300);
  const ok = (v: string) => s.safeParse(v).success;

  it('rejects every string that resolves to a third-party origin', () => {
    // All of these start with a slash — which is all `/^\//` ever checked —
    // and all of them resolve to https://evil.com/ in a browser.
    for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com', '/\t/evil.com', '/\r\n/evil.com']) {
      expect(new URL(bad, 'https://ahantime.com').origin).not.toBe('https://ahantime.com');
      expect(ok(bad)).toBe(false);
    }
  });

  it('rejects an absolute URL of any scheme', () => {
    for (const bad of ['https://evil.com/x', 'HTTP://evil.com/x', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(ok(bad)).toBe(false);
    }
  });

  it('still accepts real internal paths, including the un-slashed form', () => {
    // `redirectsRepo.normalizePath` adds the leading slash, so this shape has
    // to keep validating or the redirect form regresses.
    for (const good of ['/prices/rebar', 'prices/rebar', '/blog/x?a=1#b', '/blog/راهنما', '/']) {
      expect(ok(good)).toBe(true);
    }
  });
});
