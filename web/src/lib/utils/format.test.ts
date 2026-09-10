import { describe, it, expect } from 'vitest';
import {
  toPersianDigits,
  normalizeDigits,
  formatToman,
  formatMovement,
  normalizeMobile,
  isObviouslyFakeMobile,
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
  it('renders an empty string for undefined (no dash — the badge shows nothing)', () => {
    expect(formatMovement(undefined)).toBe('');
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
    expect(normalizeMobile('abc09121395954')).toBeNull();
    expect(normalizeMobile('0912-139-5954 ext 1')).toBeNull();
  });
  it('accepts common visual separators', () => {
    expect(normalizeMobile(' ۰۹۱۲ ۱۳۹ ۵۹۵۴ ')).toBe('09121395954');
    expect(normalizeMobile('+98 (912) 139-5954')).toBe('09121395954');
  });
});

describe('isObviouslyFakeMobile (F-134)', () => {
  it('flags every digit identical', () => {
    expect(isObviouslyFakeMobile('09000000000')).toBe(true);
    expect(isObviouslyFakeMobile('09111111111')).toBe(true);
    expect(isObviouslyFakeMobile('09999999999')).toBe(true);
  });
  it('flags a strictly ascending sequence, wrapping 9→0', () => {
    expect(isObviouslyFakeMobile('09123456789')).toBe(true);
    expect(isObviouslyFakeMobile('09234567890')).toBe(true);
  });
  it('flags a strictly descending sequence, wrapping 0→9', () => {
    expect(isObviouslyFakeMobile('09987654321')).toBe(true);
  });
  it('does not flag a real-shaped subscriber number', () => {
    expect(isObviouslyFakeMobile('09121395954')).toBe(false);
    expect(isObviouslyFakeMobile('09355512345')).toBe(false);
  });
});

describe('mixed-script digit formatting', () => {
  it('converts every Latin and Arabic digit while preserving surrounding text', () => {
    expect(toPersianDigits('0123456789 / ٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹ تومان')).toBe(
      '۰۱۲۳۴۵۶۷۸۹ / ۰۱۲۳۴۵۶۷۸۹ / ۰۱۲۳۴۵۶۷۸۹ تومان',
    );
  });

  it('normalizes mixed Persian and Arabic digits without changing separators or signs', () => {
    expect(normalizeDigits('-۰١۲٣۴٥۶٧۸٩.50 / steel')).toBe('-0123456789.50 / steel');
  });
});
