import { describe, it, expect } from 'vitest';
import { isLetterheadUsable } from './letterhead';

describe('isLetterheadUsable', () => {
  it('requires both a logo and a company name', () => {
    expect(isLetterheadUsable(null)).toBe(false);
    expect(isLetterheadUsable({ logoUrl: null, companyName: null })).toBe(false);
    expect(isLetterheadUsable({ logoUrl: '/uploads/x.png', companyName: null })).toBe(false);
    expect(isLetterheadUsable({ logoUrl: null, companyName: 'شرکت من' })).toBe(false);
    expect(isLetterheadUsable({ logoUrl: '/uploads/x.png', companyName: 'شرکت من' })).toBe(true);
  });

  it('a whitespace-only company name does not count', () => {
    expect(isLetterheadUsable({ logoUrl: '/uploads/x.png', companyName: '   ' })).toBe(false);
  });
});
