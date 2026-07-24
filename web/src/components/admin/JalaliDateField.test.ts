// @vitest-environment node
/** Locks the Jalali→Gregorian conversion the admin date filters rely on.
 *  Reference dates cross-checked against the official calendar:
 *  1403/01/01 = 2024-03-20 (Nowruz), 1404/05/01 = 2025-07-23. */
import { describe, it, expect } from 'vitest';
import { jalaliTextToIso } from './JalaliDateField';

describe('jalaliTextToIso', () => {
  it('converts canonical dates (Nowruz + mid-year)', () => {
    expect(jalaliTextToIso('1403/01/01')).toBe('2024-03-20');
    expect(jalaliTextToIso('1404/05/01')).toBe('2025-07-23');
  });

  it('accepts Persian digits, dashes and 1-digit month/day', () => {
    expect(jalaliTextToIso('۱۴۰۳/۱/۱')).toBe('2024-03-20');
    expect(jalaliTextToIso('1404-5-1')).toBe('2025-07-23');
  });

  it('rejects malformed or non-date input', () => {
    expect(jalaliTextToIso('')).toBeNull();
    expect(jalaliTextToIso('1404/05')).toBeNull();
    expect(jalaliTextToIso('abc')).toBeNull();
    expect(jalaliTextToIso('05/01/1404')).toBeNull();
  });
});
