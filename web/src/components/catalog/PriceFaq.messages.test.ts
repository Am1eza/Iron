// @vitest-environment node
/**
 * The FAQ answers are ICU messages whose grammar depends on the number. In
 * Arabic the counted noun changes form with the last two digits (CLDR): 2 →
 * dual, 3–10 → plural, 11–99 → singular accusative, 0 and 100–102 →
 * singular. The first draft said «لـ7 منتجًا», which is wrong. These render
 * the real catalogue through next-intl's own formatter.
 */
import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import ar from '../../../messages/ar.json';
import fa from '../../../messages/fa.json';

const tAr = createTranslator({ locale: 'ar', messages: ar, namespace: 'pricesFacet' });
const range = (count: number) =>
  tAr('faqPriceRange', { subject: 'حديد التسليح', unit: 'كيلوغرام', min: '1', max: '2', count });

describe('Arabic FAQ plurals', () => {
  it('uses the dual for two products', () => {
    expect(range(2)).toContain('المؤكدة لمنتجين.');
  });
  it('uses the plural for 3–10', () => {
    expect(range(7)).toContain('لـ7 منتجات.');
    expect(range(10)).toContain('لـ10 منتجات.');
    expect(range(203)).toContain('لـ203 منتجات.');
  });
  it('uses the singular accusative for 11–99, including 240', () => {
    expect(range(33)).toContain('لـ33 منتجًا.');
    expect(range(240)).toContain('لـ240 منتجًا.');
  });
  it('uses the plain singular for 100', () => {
    expect(range(100)).toContain('لـ100 منتج.');
  });
  it('counts mills the same way', () => {
    expect(tAr('faqMillsA', { subject: 'x', list: 'a', count: 5 })).toContain('من 5 مصانع:');
    expect(tAr('faqMillsA', { subject: 'x', list: 'a', count: 12 })).toContain('من 12 مصنعًا:');
    expect(tAr('faqMillsMore', { list: 'a', rest: 3 })).toBe('a و3 مصانع أخرى');
  });
});

describe('Persian FAQ numbers', () => {
  it('are formatted with Persian digits by ICU itself', () => {
    const tFa = createTranslator({ locale: 'fa', messages: fa, namespace: 'pricesFacet' });
    expect(
      tFa('faqPriceRange', { subject: 'میلگرد', unit: 'کیلوگرم', min: '۱', max: '۲', count: 33 }),
    ).toContain('قیمت تأییدشدهٔ ۳۳ کالا');
  });
});

describe('Persian mill counts', () => {
  it('use Persian digits too', () => {
    const tFa = createTranslator({ locale: 'fa', messages: fa, namespace: 'pricesFacet' });
    expect(tFa('faqMillsA', { subject: 'میلگرد', list: 'الف', count: 12 })).toContain('۱۲ کارخانه');
    expect(tFa('faqMillsMore', { list: 'الف', rest: 3 })).toBe('الف و ۳ کارخانهٔ دیگر');
  });
});
