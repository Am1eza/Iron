import { describe, expect, it } from 'vitest';
import { canonicalCatalogValue, catalogProductIdentity } from './catalogIdentity';

describe('canonical catalog identity', () => {
  it('folds Persian/Arabic/Latin digits, ZWNJ, separators and Arabic letters', () => {
    expect(canonicalCatalogValue('ذوب‌آهن ۱۴×۱۴')).toBe(canonicalCatalogValue('ذوب اهن 14 x 14'));
    expect(canonicalCatalogValue('كوير ١٤')).toBe(canonicalCatalogValue('کویر 14'));
  });

  it('ignores display name but distinguishes real structured specifications', () => {
    const a = catalogProductIdentity({ size: '۱۴', grade: 'A3', factory: 'ذوب‌آهن', unit: 'branch', priceBasis: 'kg' });
    const same = catalogProductIdentity({ size: '14', grade: 'a3', factory: 'ذوب آهن', unit: 'branch', priceBasis: 'kg' });
    const different = catalogProductIdentity({ size: '۱۴', grade: 'A2', factory: 'ذوب آهن', unit: 'branch', priceBasis: 'kg' });
    expect(a).toBe(same);
    expect(a).not.toBe(different);
  });
});
