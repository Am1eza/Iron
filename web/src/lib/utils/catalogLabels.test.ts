import { describe, it, expect } from 'vitest';
import { sizeLabel, usesThickness, SIZE_LABEL, THICKNESS_LABEL } from './catalogLabels';

describe('sizeLabel', () => {
  it('calls the ورق attribute ضخامت', () => {
    expect(sizeLabel('sheet')).toBe(THICKNESS_LABEL);
    expect(usesThickness('sheet')).toBe(true);
  });

  it('leaves every other category on سایز', () => {
    for (const slug of ['rebar', 'ibeam', 'pipe', 'profile', 'angle-channel', 'wire', 'steel']) {
      expect(sizeLabel(slug)).toBe(SIZE_LABEL);
      expect(usesThickness(slug)).toBe(false);
    }
  });

  it('falls back to سایز for an unknown, mixed or missing category', () => {
    // A mixed list (the «استیل» hub page cross-lists sheet products) has no
    // single answer — the generic label is the safe one, never a wrong rename.
    expect(sizeLabel(undefined)).toBe(SIZE_LABEL);
    expect(sizeLabel(null)).toBe(SIZE_LABEL);
    expect(sizeLabel('')).toBe(SIZE_LABEL);
    expect(sizeLabel('something-new')).toBe(SIZE_LABEL);
  });
});
