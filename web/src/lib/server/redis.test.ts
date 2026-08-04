// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { jitterTtl } from './redis';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('jitterTtl', () => {
  it('never exceeds the base TTL (the documented staleness bound holds)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(jitterTtl(30)).toBe(30);
    expect(jitterTtl(600)).toBe(600);
  });

  it('subtracts at most `spread` of the base', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(jitterTtl(600, 0.2)).toBe(480); // 600 · (1 − 0.2)
    expect(jitterTtl(30, 0.2)).toBe(24);
  });

  it('scales linearly in between', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(jitterTtl(600, 0.2)).toBe(540); // 600 · (1 − 0.1)
  });

  it('floors at 1 second so a tiny base never yields a useless TTL', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(jitterTtl(1)).toBe(1);
    expect(jitterTtl(2, 0.9)).toBe(1);
  });

  it('actually de-synchronises: 200 simultaneous fills land on many distinct expiries', () => {
    // The point of the change. Before it, every one of these was exactly 30 —
    // so the whole burst expired in the same instant and missed together.
    const ttls = new Set(Array.from({ length: 200 }, () => jitterTtl(30)));
    expect(ttls.size).toBeGreaterThan(3);
    for (const t of ttls) {
      expect(t).toBeGreaterThanOrEqual(24);
      expect(t).toBeLessThanOrEqual(30);
    }
  });
});
