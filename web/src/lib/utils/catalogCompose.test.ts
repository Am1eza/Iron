import { describe, it, expect } from 'vitest';
import {
  composeSkuName,
  composeSkuSlug,
  defaultBranchLengthM,
  defaultPriceBasisFor,
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

  it('refuses میلگرد ساده, whose sub-category mixes a 6 m branch with coil', () => {
    // ahanonline quotes «شاخه ۶ متری» for the straight-bar mills and «کلاف»
    // for the rest under one heading — no single length is right for it.
    expect(theoreticalWeightFor('rebar', '۱۴', 'mylgrd-sadh')).toBeNull();
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

describe('theoreticalWeightFor — the per-SKU branch length', () => {
  it('uses the sub-category convention when the SKU records no length', () => {
    // نبشی ۱۰ over the documented 6 m branch — مرکزآهن's published 94.32 kg.
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'nabshi')).toBeCloseTo(94.3, 1);
  });

  it('doubles for a SKU explicitly marked ۱۲ متری', () => {
    // ahanonline's own نبشی listing carries ۱۲ متری rows alongside ۶ متری
    // ones; a per-line constant is exactly 2× wrong for them.
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'nabshi', 12)).toBeCloseTo(188.6, 1);
  });

  it('ignores a zero, negative or non-finite length rather than trusting it', () => {
    for (const bad of [0, -6, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(theoreticalWeightFor('angle-channel', '۱۰', 'nabshi', bad)).toBeCloseTo(94.3, 1);
    }
  });

  it('still returns null for a line with no published table, length or not', () => {
    expect(theoreticalWeightFor('angle-channel', '۱۰', 'channel-heavy', 6)).toBeNull();
  });
});

describe('defaultBranchLengthM', () => {
  it('reports the documented convention for the lines that have one', () => {
    expect(defaultBranchLengthM('angle-channel', 'nabshi')).toBe(6);
    expect(defaultBranchLengthM('ibeam', 'tirahan')).toBe(12);
    expect(defaultBranchLengthM('rebar', 'deformed')).toBe(12);
  });

  it('is null for a line with no meaningful branch', () => {
    expect(defaultBranchLengthM('wire', 'coil')).toBeNull();
    expect(defaultBranchLengthM('rebar', 'coupler')).toBeNull();
  });
});

describe('defaultPriceBasisFor / defaultUnitFor — ساندویچ‌پانل', () => {
  it('prefills «متر مربع» for ساندویچ‌پانل, both unit and basis', () => {
    expect(defaultUnitFor('sheet', 'sandwich-panel')).toBe('sqm');
    expect(defaultPriceBasisFor('sheet', 'sandwich-panel')).toBe('sqm');
  });

  it('keeps «برگ» and a kilogram basis for every other ورق line', () => {
    expect(defaultUnitFor('sheet', 'black')).toBe('sheet');
    expect(defaultPriceBasisFor('sheet', 'black')).toBe('kg');
  });

  it('prefills «عدد» for کوپلر, both unit and basis', () => {
    expect(defaultUnitFor('rebar', 'coupler')).toBe('piece');
    expect(defaultPriceBasisFor('rebar', 'coupler')).toBe('piece');
  });

  it('defaults everything else to a kilogram basis — the catalog’s 880-row norm', () => {
    expect(defaultPriceBasisFor('rebar', 'deformed')).toBe('kg');
    expect(defaultPriceBasisFor('something-new')).toBe('kg');
  });
});
