import { describe, expect, it } from 'vitest';
import { extractSizeCandidates } from './AdvisorChat';

describe('extractSizeCandidates', () => {
  it('keeps a three-axis section intact and tries it before its bare numbers', () => {
    const candidates = extractSizeCandidates('نبشی 60 x 60 * 6 می‌خوام');
    expect(candidates[0]).toBe('60×60×6');
    expect(candidates).toContain('60');
    expect(candidates).toContain('6');
  });

  it('keeps decimal axes in a dimension', () => {
    expect(extractSizeCandidates('پروفیل 20×40×2.5')[0]).toBe('20×40×2.5');
  });
});
