// @vitest-environment node
/**
 * The half-space is the one Persian spelling axis `normalizePersian` never
 * covered: JS `\s` does not include U+200C, so «ذوب‌آهن» and «ذوب آهن» were two
 * unequal strings that render nearly identically, and the panel could neither
 * keep them apart nor bring them together.
 *
 * Every literal below is written with an escape, never the character itself —
 * a zero-width character in an assertion is a test nobody can read.
 */
import { describe, it, expect } from 'vitest';
import { foldCatalogZwnj, foldZwnjForSearch, normalizeCatalogText, ZWNJ } from './persianZwnj';

const zwnj = '\u200c';

describe('foldCatalogZwnj — what gets stored', () => {
  it('keeps a meaningful half-space: Persian typography needs it', () => {
    // «می‌رود» is not «می رود». Rewriting the admin's text is not this
    // function's job — only removing the ZWNJs that render as nothing.
    expect(foldCatalogZwnj(`می${zwnj}رود`)).toBe(`می${zwnj}رود`);
    expect(foldCatalogZwnj(`ذوب${zwnj}آهن`)).toBe(`ذوب${zwnj}آهن`);
  });

  it('drops a half-space that sits next to a space, which renders as nothing', () => {
    // The third spelling: identical on screen to «ذوب آهن», unequal to it in
    // the database, and therefore its own factory in the public comparison.
    expect(foldCatalogZwnj(`ذوب ${zwnj} آهن`)).toBe('ذوب آهن');
    expect(foldCatalogZwnj(`ذوب${zwnj} آهن`)).toBe('ذوب آهن');
  });

  it('collapses a doubled half-space and strips one at either end', () => {
    expect(foldCatalogZwnj(`ذوب${zwnj}${zwnj}آهن`)).toBe(`ذوب${zwnj}آهن`);
    expect(foldCatalogZwnj(`${zwnj}ذوب${zwnj}آهن${zwnj}`)).toBe(`ذوب${zwnj}آهن`);
  });

  it('leaves ordinary text alone', () => {
    expect(foldCatalogZwnj('میلگرد ۱۴ نیشابور')).toBe('میلگرد ۱۴ نیشابور');
  });
});

describe('normalizeCatalogText — the stored form of a catalog field', () => {
  it('still does everything normalizePersian did', () => {
    // Arabic ي/ك and a harakat, the case catalogAdminSearch.pg.test.ts pins.
    expect(normalizeCatalogText('كارخانهٔ آزمایشی')).toBe('کارخانه آزمایشی');
  });

  it('and now the half-space too', () => {
    expect(normalizeCatalogText(`كارخانه ${zwnj} آزمایشی`)).toBe('کارخانه آزمایشی');
  });
});

describe('foldZwnjForSearch — what gets matched', () => {
  it('makes the two legitimate spellings one string', () => {
    expect(foldZwnjForSearch(`ذوب${zwnj}آهن`)).toBe(foldZwnjForSearch('ذوب آهن'));
  });

  it('exports the character it folds, for the SQL side to use', () => {
    expect(ZWNJ).toBe(zwnj);
    expect(ZWNJ).toHaveLength(1);
  });
});
