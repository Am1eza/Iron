import { describe, it, expect } from 'vitest';
import { subCategorySubject } from './catalogLabels';

/**
 * Every case below is a live (category, sub-category) pair, taken from the
 * production taxonomy. 29 active sub-categories carry their category's name
 * inside their own, and each of those was serving a title, an H1 and a meta
 * description with the word in it twice.
 */
describe('subCategorySubject', () => {
  it('does not repeat a category word the sub name already carries', () => {
    // The three the audit caught, plus the worst one: a sub named exactly
    // after its category was titling itself «قیمت روز تیرآهن تیرآهن».
    expect(subCategorySubject('میلگرد آجدار', 'میلگرد')).toBe('میلگرد آجدار');
    expect(subCategorySubject('میلگرد ساده', 'میلگرد')).toBe('میلگرد ساده');
    expect(subCategorySubject('لوله استیل', 'استیل')).toBe('لوله استیل');
    expect(subCategorySubject('تیرآهن', 'تیرآهن')).toBe('تیرآهن');
    expect(subCategorySubject('ورق گالوانیزه', 'ورق')).toBe('ورق گالوانیزه');
    expect(subCategorySubject('پروفیل صنعتی', 'پروفیل')).toBe('پروفیل صنعتی');
  });

  it('still appends the category when the sub name does not say it', () => {
    // The whole reason the suffix exists: «هاش سبک» alone means nothing to a
    // searcher, and «قیمت هاش سبک تیرآهن» is the query people actually type.
    expect(subCategorySubject('هاش سبک', 'تیرآهن')).toBe('هاش سبک تیرآهن');
    expect(subCategorySubject('لانه زنبوری', 'تیرآهن')).toBe('لانه زنبوری تیرآهن');
    expect(subCategorySubject('داربستی', 'لوله')).toBe('داربستی لوله');
    expect(subCategorySubject('وال پست', 'نبشی و ناودانی')).toBe('وال پست نبشی و ناودانی');
  });

  it('sees through a ZWNJ, which admin-entered names carry inconsistently', () => {
    // «لوله گوشت‌دار» is stored with a ZWNJ; the category is not. Comparing the
    // raw strings still matches here, but «آهن‌آلات»-shaped names would not.
    expect(subCategorySubject('لوله گوشت‌دار', 'لوله')).toBe('لوله گوشت‌دار');
    expect(subCategorySubject('لوله‌گوشت‌دار', 'لوله')).toBe('لوله‌گوشت‌دار');
  });

  it('folds the Arabic ي and ك onto their Persian letters', () => {
    // Both spellings occur in admin-entered text and are invisible to a reader.
    expect(subCategorySubject('پروفيل صنعتی', 'پروفیل')).toBe('پروفيل صنعتی');
    expect(subCategorySubject('میلگرد آجدار', 'ميلگرد')).toBe('میلگرد آجدار');
  });

  it('matches whole tokens, never a fragment of a longer word', () => {
    // «ورقه» is not «ورق»; a substring test would have swallowed the category
    // keyword and shipped a title that never says what the page is about.
    expect(subCategorySubject('ورقه‌ای', 'ورق')).toBe('ورقه‌ای ورق');
  });

  it('appends when the category name is only partly present', () => {
    // «نبشی و ناودانی» — deliberately unchanged. Each sub repeats one word of
    // the two-word category without containing the whole of it, and trimming
    // per token would produce «ناودانی سبک نبشی و».
    expect(subCategorySubject('نبشی', 'نبشی و ناودانی')).toBe('نبشی نبشی و ناودانی');
  });
});
