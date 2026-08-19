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
    expect(composeSkuName({ subName: 'میلگرد آجدار', size: '۱۴', factory: 'ذوب‌آهن اصفهان' })).toBe(
      'میلگرد آجدار ۱۴ ذوب‌آهن اصفهان',
    );
  });

  it('drops absent parts instead of leaving double spaces', () => {
    expect(composeSkuName({ subName: 'ورق سیاه', size: '۲' })).toBe('ورق سیاه ۲');
  });

  // Grade has its own column/field in every surface that shows it — folding
  // it into the name too meant a customer had to parse a sentence to find
  // it, and an admin could see it duplicated (or drift out of sync) between
  // the two. See catalogAdminRepo's SKU rename backfill for the one-time
  // migration that stripped it out of names already saved with it baked in.
  it('never includes grade even when one is given to a caller that forgot the type changed', () => {
    const withGrade = { subName: 'میلگرد آجدار', size: '۱۴', factory: 'ذوب‌آهن اصفهان', grade: 'A3' };
    expect(composeSkuName(withGrade)).toBe('میلگرد آجدار ۱۴ ذوب‌آهن اصفهان');
  });
});

describe('theoreticalWeightFor', () => {
  it('uses d²/162 × 12m for a rebar branch', () => {
    // 14² / 162 × 12 ≈ 14.5 kg — the number the customer weight calculator
    // and the cost estimate are both built on.
    expect(theoreticalWeightFor('rebar', '۱۴', 'deformed')).toBeCloseTo(14.5, 1);
    expect(theoreticalWeightFor('rebar', '۱۶', 'deformed')).toBeCloseTo(19, 0);
  });

  it('reads نبشی from the published angle table over a 6 m branch, not the round-bar formula', () => {
    // «نبشی ۱۰» is L100×100×10 = 15.72 kg/m (ANGLE_KG_PER_M, مرکزآهن's
    // published table) × 6 m = 94.3 kg. The round-bar formula this function
    // used to reach for said 7.4 kg — a 12.7× understatement that was stored
    // on the live SKU.
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'nabshi')).toBeCloseTo(94.3, 1);
    expect(theoreticalWeightFor('angle-channel', '۶', 'nabshi')).toBeCloseTo(34, 0);
    // The pre-rename sub slug resolves identically.
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'angle')).toBeCloseTo(94.3, 1);
  });

  it('refuses نبشی sizes the published table does not cover rather than approximating', () => {
    // ANGLE_KG_PER_M stops at a 120 mm leg; the geometric fallback drifts ~5 %
    // at those sizes, so «نبشی ۱۴/۱۶/۱۸» get no number at all.
    expect(theoreticalWeightFor('angle-channel', '۱۴', 'nabshi')).toBeNull();
    expect(theoreticalWeightFor('angle-channel', '۱۸', 'nabshi')).toBeNull();
  });

  it('reads تیرآهن from the IPE table over a 12 m branch', () => {
    // 12.9 kg/m × 12 = 154.8 — which is the 155 already stored on «تیرآهن ۱۴
    // ذوب‌آهن اصفهان», so this path reproduces the catalog's own good data.
    expect(theoreticalWeightFor('ibeam', '۱۴', 'tirahan')).toBeCloseTo(154.8, 1);
  });

  it('refuses every sub-category whose section or branch length is not published', () => {
    // ناودانی سبک/سنگین are separate weight classes from the اشتال tier in
    // CHANNEL_KG_PER_M and the public tables for them disagree by ~11%.
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'channel-light')).toBeNull();
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'channel-heavy')).toBeNull();
    // هاش is HEA/HEB, not IPE.
    expect(theoreticalWeightFor('ibeam', '۱۴', 'hash-sabok')).toBeNull();
    expect(theoreticalWeightFor('ibeam', '۲۰', 'lane-zanburi')).toBeNull();
    // A box needs a wall thickness and a plate needs width × length; neither
    // is stored, so guessing would feed a wrong tonnage into a customer quote.
    expect(theoreticalWeightFor('sheet', '۲', 'black')).toBeNull();
    expect(theoreticalWeightFor('profile', '۴۰×۴۰', 'box-square')).toBeNull();
    // A pipe's «۲ اینچ» is the outside diameter only.
    expect(theoreticalWeightFor('pipe', '۲ اینچ', 'gas')).toBeNull();
    // کلاف/مفتول are coils — `weight.ts` gives the `wire` shape no default
    // length for exactly this reason. There is no «شاخه» to weigh.
    expect(theoreticalWeightFor('wire', '۸', 'coil')).toBeNull();
  });

  it('returns null when the sub-category is unknown, rather than falling back to a category rule', () => {
    // The section is a property of the sub-category. Answering from the
    // category alone is what produced «ناودانی ۱۰ = ۷.۴ kg».
    expect(theoreticalWeightFor('rebar', '۱۴')).toBeNull();
    expect(theoreticalWeightFor('angle-channel', '۱۰')).toBeNull();
  });

  it('returns null for a missing or unparseable size', () => {
    expect(theoreticalWeightFor('rebar', '', 'deformed')).toBeNull();
    expect(theoreticalWeightFor('rebar', 'نامشخص', 'deformed')).toBeNull();
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
