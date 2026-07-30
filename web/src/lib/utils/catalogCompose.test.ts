import { describe, it, expect } from 'vitest';
import {
  composeSkuName,
  composeSkuSlug,
  defaultUnitFor,
  factorySlug,
  theoreticalWeightFor,
} from './catalogCompose';

describe('composeSkuSlug', () => {
  it('builds a readable URL from what the product IS', () => {
    expect(
      composeSkuSlug({ categorySlug: 'rebar', size: '۱۴', grade: 'A3', factory: 'ذوب‌آهن اصفهان' }),
    ).toBe('rebar-14-a3-zobahan');
  });

  it('folds Persian digits so the URL stays ASCII', () => {
    expect(composeSkuSlug({ categorySlug: 'sheet', size: '۲' })).toBe('sheet-2');
  });

  it('turns × into x rather than dropping the dimension', () => {
    expect(composeSkuSlug({ categorySlug: 'profile', size: '۴۰×۴۰' })).toBe('profile-40x40');
  });

  it('skips missing parts without leaving stray hyphens', () => {
    expect(composeSkuSlug({ categorySlug: 'pipe', factory: 'سپنتا' })).toBe('pipe-sepanta');
    expect(composeSkuSlug({ categorySlug: 'wire' })).toBe('wire');
  });

  it('always produces a slug the server schema accepts', () => {
    const slug = composeSkuSlug({
      categorySlug: 'rebar',
      size: '۱۸',
      grade: 'A2',
      factory: 'یک کارخانهٔ ثبت‌نشده',
    });
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe('factorySlug', () => {
  it('uses the curated Latin name for a known factory', () => {
    // Transliterating this letter-by-letter gives unreadable Finglish.
    expect(factorySlug('فولاد مبارکه')).toBe('mobarakeh');
    expect(factorySlug('ذوب‌آهن اصفهان')).toBe('zobahan');
  });

  it('accepts the spaced spelling of a hyphenated name', () => {
    expect(factorySlug('ذوب آهن اصفهان')).toBe('zobahan');
  });

  it('falls back to transliteration for an unknown factory', () => {
    expect(factorySlug('کارخانهٔ تازه')).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('composeSkuName', () => {
  it('reads the way the catalog already reads', () => {
    expect(
      composeSkuName({ subName: 'میلگرد آجدار', size: '۱۴', grade: 'A3', factory: 'ذوب‌آهن اصفهان' }),
    ).toBe('میلگرد آجدار ۱۴ A3 ذوب‌آهن اصفهان');
  });

  it('drops absent parts instead of leaving double spaces', () => {
    expect(composeSkuName({ subName: 'ورق سیاه', size: '۲' })).toBe('ورق سیاه ۲');
  });
});

describe('theoreticalWeightFor', () => {
  it('uses d²/162 × 12m for a rebar branch', () => {
    // 14² / 162 × 12 ≈ 14.5 kg — the number the customer weight calculator
    // and the cost estimate are both built on.
    expect(theoreticalWeightFor('rebar', '۱۴')).toBeCloseTo(14.5, 1);
    expect(theoreticalWeightFor('rebar', '۱۶')).toBeCloseTo(19, 0);
  });

  it('uses the per-metre figure for wire', () => {
    expect(theoreticalWeightFor('wire', '۸')).toBeCloseTo(0.4, 1);
  });

  it('refuses to invent a weight for shapes the formula does not describe', () => {
    // A sheet or a profile has no round-bar diameter; guessing would feed a
    // wrong tonnage straight into a customer quote.
    expect(theoreticalWeightFor('sheet', '۲')).toBeNull();
    expect(theoreticalWeightFor('profile', '۴۰×۴۰')).toBeNull();
  });

  it('returns null for a missing or unparseable size', () => {
    expect(theoreticalWeightFor('rebar', '')).toBeNull();
    expect(theoreticalWeightFor('rebar', 'نامشخص')).toBeNull();
  });
});

describe('defaultUnitFor', () => {
  it('matches how each category is actually sold', () => {
    expect(defaultUnitFor('rebar')).toBe('branch');
    expect(defaultUnitFor('ibeam')).toBe('branch');
    expect(defaultUnitFor('sheet')).toBe('sheet');
    expect(defaultUnitFor('pipe')).toBe('meter');
    expect(defaultUnitFor('wire')).toBe('kg');
  });

  it('falls back to kg for a category the admin invents', () => {
    expect(defaultUnitFor('something-new')).toBe('kg');
  });
});
