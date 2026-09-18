import { describe, it, expect } from 'vitest';
import { subCategorySubject, localizedSubCategorySubject, sectionSubject } from './catalogLabels';

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

/**
 * The same question in en/ar/zh. Every pair below is a live (sub, category)
 * name pair, and every "before" string is a <title> production served on
 * 2026-09-18.
 */
describe('localizedSubCategorySubject', () => {
  it('stops repeating the category in Arabic, where the two words inflect differently', () => {
    // was «سعر أنبوب مجلفن الأنابيب اليوم»
    expect(localizedSubCategorySubject('أنبوب مجلفن', 'الأنابيب', 'pipe', 'ar')).toBe('أنبوب مجلفن');
    // was «سعر حديد تسليح مضلع حديد التسليح اليوم»
    expect(localizedSubCategorySubject('حديد تسليح مضلع', 'حديد التسليح', 'rebar', 'ar')).toBe(
      'حديد تسليح مضلع',
    );
    // was «سعر صفيحة سوداء (ساخنة الدرفلة) الصفائح اليوم»
    expect(localizedSubCategorySubject('صفيحة سوداء (ساخنة الدرفلة)', 'الصفائح', 'sheet', 'ar')).toBe(
      'صفيحة سوداء (ساخنة الدرفلة)',
    );
    // was «سعر بروفيل Z بروفيل (قطاعات) اليوم»
    expect(localizedSubCategorySubject('بروفيل Z', 'بروفيل (قطاعات)', 'profile', 'ar')).toBe('بروفيل Z');
  });

  it('stops repeating the category in Chinese, which has no token boundaries', () => {
    // was «标准工字钢 工字钢 今日价格» and «带肋钢筋 螺纹钢 今日价格»
    expect(localizedSubCategorySubject('标准工字钢', '工字钢', 'ibeam', 'zh')).toBe('标准工字钢');
    expect(localizedSubCategorySubject('带肋钢筋', '螺纹钢', 'rebar', 'zh')).toBe('带肋钢筋');
    expect(localizedSubCategorySubject('镀锌管', '钢管', 'pipe', 'zh')).toBe('镀锌管');
    expect(localizedSubCategorySubject('轻型H型钢(HEA)', '工字钢', 'ibeam', 'zh')).toBe('轻型H型钢(HEA)');
    expect(localizedSubCategorySubject('Z型钢', '型材', 'profile', 'zh')).toBe('Z型钢');
  });

  it('stops repeating the category in English', () => {
    // was «Light H-Beam (HEA) I-Beam price today» and «Z-Profile Profile price today»
    expect(localizedSubCategorySubject('Light H-Beam (HEA)', 'I-Beam', 'ibeam', 'en')).toBe('Light H-Beam (HEA)');
    expect(localizedSubCategorySubject('Z-Profile', 'Profile', 'profile', 'en')).toBe('Z-Profile');
  });

  it('still appends the category when the translated sub name is only a qualifier', () => {
    // «H خفيف (HEA)» says "light H" — without «كمرة I» nothing names the product.
    expect(localizedSubCategorySubject('H خفيف (HEA)', 'كمرة I', 'ibeam', 'ar')).toBe('H خفيف (HEA) كمرة I');
    expect(localizedSubCategorySubject('Scaffold', 'Pipes', 'pipe', 'en')).toBe('Scaffold Pipes');
  });

  it('matches English on whole words only', () => {
    // "beams" is not "beam" and "Sheetrock" is not "sheet"; a substring test would drop the category.
    expect(localizedSubCategorySubject('Sheetrock', 'Sheets', 'sheet', 'en')).toBe('Sheetrock Sheets');
  });

  it('leaves the two deliberate exceptions exactly as the Persian rule does', () => {
    expect(localizedSubCategorySubject('Equal Angle', 'Angle & Channel', 'angle-channel', 'en')).toBe(
      'Equal Angle Angle & Channel',
    );
    expect(localizedSubCategorySubject('Copper Pipe', 'Non-Ferrous Metals', 'felezat-rangi', 'en')).toBe(
      'Copper Pipe Non-Ferrous Metals',
    );
  });

  it('is exactly subCategorySubject for Persian', () => {
    expect(localizedSubCategorySubject('هاش سبک', 'تیرآهن', 'ibeam', 'fa')).toBe('هاش سبک تیرآهن');
    expect(localizedSubCategorySubject('لوله گالوانیزه', 'لوله', 'pipe', 'fa')).toBe('لوله گالوانیزه');
    // A Persian name containing a Chinese/English head term is not a thing,
    // but the fa path must not consult the table at all.
    expect(localizedSubCategorySubject('ورقه‌ای', 'ورق', 'sheet', 'fa')).toBe('ورقه‌ای ورق');
  });
});

/**
 * The neighbouring question: what a FACTORY-GROUPED SECTION on a price page
 * is a section of — «قیمت {موضوع} {کارخانه}».
 *
 * Sub slugs are the live ones (`hash-sabok`, `hash-sangin`, `lane-zanburi`),
 * verified against the production catalog. `data/nav.ts` is a mock fixture
 * and still lists `hea`/`heb`/`castellated`, which match nothing live.
 */
describe('sectionSubject', () => {
  const HASH = { slug: 'hash-sabok', name: 'هاش سبک' };

  it('names the sub-type on تیرآهن’s هاش and لانه‌زنبوری subs', () => {
    // Category first, so the qualifier stays next to what it qualifies and
    // the mill name that follows is not stranded three phrases away.
    expect(sectionSubject('تیرآهن', 'ibeam', HASH)).toBe('تیرآهن هاش سبک');
    expect(sectionSubject('تیرآهن', 'ibeam', { slug: 'hash-sangin', name: 'هاش سنگین' })).toBe(
      'تیرآهن هاش سنگین',
    );
    expect(sectionSubject('تیرآهن', 'ibeam', { slug: 'lane-zanburi', name: 'لانه زنبوری' })).toBe(
      'تیرآهن لانه زنبوری',
    );
  });

  it('leaves plain تیرآهن alone rather than stuttering the category word', () => {
    // `tirahan` is deliberately outside the allow-list — «قیمت تیرآهن تیرآهن
    // ذوب‌آهن اصفهان» is exactly what subCategorySubject exists to prevent.
    expect(sectionSubject('تیرآهن', 'ibeam', { slug: 'tirahan', name: 'تیرآهن' })).toBe('تیرآهن');
  });

  it('falls back to the category name in the mixed «همه» view', () => {
    // One mill's section there can hold plain تیرآهن and هاش rows at once, so
    // no sub-specific subject is true of all of them.
    expect(sectionSubject('تیرآهن', 'ibeam', null)).toBe('تیرآهن');
    expect(sectionSubject('تیرآهن', 'ibeam', undefined)).toBe('تیرآهن');
  });

  it('changes nothing for any other category', () => {
    // Including a category that happens to have a same-named sub slug.
    for (const slug of ['rebar', 'pipe', 'sheet', 'profile', 'steel', 'angle-channel']) {
      expect(sectionSubject('میلگرد', slug, HASH)).toBe('میلگرد');
      expect(sectionSubject('میلگرد', slug, { slug: 'deformed', name: 'آجدار A3' })).toBe('میلگرد');
    }
    expect(sectionSubject('تیرآهن', null, HASH)).toBe('تیرآهن');
    expect(sectionSubject('تیرآهن', undefined, HASH)).toBe('تیرآهن');
  });

  it('does not double the category word if a sub is renamed to include it', () => {
    // Shares subCategorySubject's de-duplication, so the two cannot drift.
    expect(sectionSubject('تیرآهن', 'ibeam', { slug: 'hash-sabok', name: 'تیرآهن هاش سبک' })).toBe(
      'تیرآهن هاش سبک',
    );
    // ZWNJ and Arabic ي/ك fold the same way they do for page titles.
    expect(sectionSubject('تیرآهن', 'ibeam', { slug: 'hash-sabok', name: 'تیرآهن\u200cهاش' })).toBe(
      'تیرآهن\u200cهاش',
    );
  });
});
