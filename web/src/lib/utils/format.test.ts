import { describe, it, expect } from 'vitest';
import {
  toPersianDigits,
  normalizeDigits,
  formatToman,
  formatMovement,
  normalizeMobile,
} from './format';

describe('toPersianDigits', () => {
  it('converts Latin digits to Persian', () => {
    expect(toPersianDigits('1402')).toBe('۱۴۰۲');
  });
  it('converts Arabic-Indic digits too', () => {
    expect(toPersianDigits('١٢٣')).toBe('۱۲۳');
  });
});

describe('normalizeDigits', () => {
  it('round-trips Persian back to Latin', () => {
    expect(normalizeDigits('۱۴۰۲')).toBe('1402');
  });
});

describe('formatToman', () => {
  it('groups thousands with the Persian separator and unit', () => {
    expect(formatToman(32450)).toBe('۳۲٬۴۵۰ تومان');
  });
  it('omits the unit when asked', () => {
    expect(formatToman(32450, false)).toBe('۳۲٬۴۵۰');
  });
  it('rounds to the nearest integer Toman', () => {
    expect(formatToman(99.6, false)).toBe('۱۰۰');
  });
});

describe('formatMovement', () => {
  it('adds a + sign for gains', () => {
    expect(formatMovement(0.8)).toBe('+۰.۸۰٪');
  });
  it('uses a minus sign (U+2212) for losses', () => {
    expect(formatMovement(-0.3)).toBe('−۰.۳۰٪');
  });
  it('renders a dash for undefined', () => {
    expect(formatMovement(undefined)).toBe('—');
  });
});

describe('normalizeMobile', () => {
  it('normalizes +98 to 0', () => {
    expect(normalizeMobile('+989121395954')).toBe('09121395954');
  });
  it('accepts Persian digits', () => {
    expect(normalizeMobile('۰۹۱۲۱۳۹۵۹۵۴')).toBe('09121395954');
  });
  it('rejects invalid numbers', () => {
    expect(normalizeMobile('12345')).toBeNull();
  });
});
