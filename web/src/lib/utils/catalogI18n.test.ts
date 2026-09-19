import { describe, it, expect } from 'vitest';
import * as labels from './catalogLabels';
import { attributeColumns, priceBasisNoun, priceUnitCaption, sizeLabel, weightLabel, factoryLabel, dimensionsLabel } from './catalogLabels';
import type { PriceBasis } from '@/lib/types/domain';
import { localizeCatalogText, hasUntranslatedScript, latinDigits, CATALOG_PHRASE_KEYS } from './catalogI18n';
import { KNOWN_FACTORY_NAMES, localizedFactoryName } from './factoryNames';
import { formatDisplayDate } from './jalali';

const NON_FA = ['en', 'ar', 'zh'] as const;

/** Every value the live catalog held for these columns on 2026-09-19. */
const LIVE_VALUES = {
  deliveryTime: ['۲۴ ساعت', '۴۸ ساعت', '۷۲ ساعت', 'تحویل فوری'],
  condition: ['رول', 'برش‌خورده', 'شیت'],
  standard: ['HEB', 'HEA', 'W22', 'ضد سایش', 'ST37', 'کویل ۱۵ متری', 'شاخه ۴ متری'],
  grade: ['A2', 'A3', '316L', 'گالوانیزه', 'آبی', 'قرمز', 'سفید یخچالی', 'ماشینکاری', 'نوردی', 'ضخامت ۲', 'ضخامت ۰.۸۱', '۷۰۰۰'],
  region: ['اصفهان', 'مشهد', 'تهران'],
  groupLabel: [
    'هاش', 'پروفیل استیل', 'ورق گرم', 'ورق سرد و پوشش دار', 'ساندویچ پانل', 'ورق استیل', 'لوله بدون درز', 'لوله درزدار',
    'لوله استیل', 'نبشی', 'ناودانی', 'لوله و پروفیل استیل', 'مقاطع استیل', 'توری و مش استیل', 'اتصالات و قطعات استیل',
    'آلومینیوم', 'مس',
  ],
  size: ['۱۰', '۳ اینچ', '۱/۲ اینچ', '¼۱ اینچ', '۱½ اینچ', '۳۲ میل', 'Z*۱۶'],
  dimensions: ['۱۰۰۰×۲۰۰۰', '۲٫۵', '۱۲۵۰×۲۵۰۰'],
};

describe('localizeCatalogText', () => {
  it('leaves Persian untouched', () => {
    expect(localizeCatalogText('وزن شاخه ۱۲٫۵', 'fa')).toBe('وزن شاخه ۱۲٫۵');
  });

  it('translates every label constant catalogLabels exports, in every locale', () => {
    const constants = (Object.entries(labels) as [string, unknown][]).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && hasUntranslatedScript(e[1]),
    );
    expect(constants.length).toBeGreaterThan(15);
    for (const locale of NON_FA) {
      for (const [name, value] of constants) {
        const out = localizeCatalogText(value, locale);
        expect(hasUntranslatedScript(out) && locale !== 'ar', `${name} → ${out} (${locale})`).toBe(false);
        if (locale === 'ar') expect(out, name).not.toBe('');
      }
    }
  });

  it('translates every label a table or spec sheet builds from category/sub context', () => {
    const cats = ['rebar', 'ibeam', 'profile', 'sheet', 'pipe', 'angle-channel', 'steel', 'felezat-rangi'];
    const seen = new Set<string>();
    for (const c of cats) {
      for (const sub of [null, 'deformed', 'tirahan', 'gas', 'nabshi', 'aluminum-sheet']) {
        seen.add(sizeLabel(c, sub));
        seen.add(weightLabel(c));
        seen.add(dimensionsLabel(c, sub));
        seen.add(factoryLabel(c, sub));
        for (const col of attributeColumns(c, sub)) seen.add(col.label);
      }
    }
    for (const label of seen) {
      for (const locale of ['en', 'zh'] as const) {
        expect(hasUntranslatedScript(localizeCatalogText(label, locale)), `${label} (${locale})`).toBe(false);
      }
    }
  });

  it('translates every price basis and unit caption', () => {
    const bases: PriceBasis[] = ['kg', 'branch', 'coil', 'sheet', 'piece', 'sqm'];
    for (const b of bases) {
      for (const len of [undefined, 6, 15]) {
        for (const text of [priceBasisNoun(b, len), priceUnitCaption(b, len)]) {
          for (const locale of ['en', 'zh'] as const) {
            expect(hasUntranslatedScript(localizeCatalogText(text, locale)), `${text} (${locale})`).toBe(false);
          }
        }
      }
    }
    expect(localizeCatalogText(priceUnitCaption('kg'), 'en')).toBe('Toman / kg');
    expect(localizeCatalogText(priceBasisNoun('coil', 15), 'en')).toBe('15 m coil');
    expect(localizeCatalogText(priceBasisNoun('coil', 15), 'zh')).toBe('15米卷');
  });

  it('translates every value the live catalog held, with Latin digits', () => {
    for (const [column, values] of Object.entries(LIVE_VALUES)) {
      for (const v of values) {
        for (const locale of ['en', 'zh'] as const) {
          const out = localizeCatalogText(v, locale);
          expect(hasUntranslatedScript(out), `${column}: ${v} → ${out} (${locale})`).toBe(false);
          expect(out, `${column}: ${v}`).not.toMatch(/[۰-۹٠-٩]/);
        }
      }
    }
    expect(localizeCatalogText('۲۴ ساعت', 'en')).toBe('24 hours');
    expect(localizeCatalogText('۲۴ ساعت', 'zh')).toBe('24 小时');
    expect(localizeCatalogText('تحویل فوری', 'en')).toBe('Immediate delivery');
    expect(localizeCatalogText('کویل ۱۵ متری', 'en')).toBe('15 m coil');
    expect(localizeCatalogText('۳ اینچ', 'en')).toBe('3 in');
    expect(localizeCatalogText('۱۰۰۰×۲۰۰۰', 'en')).toBe('1000×2000');
    expect(localizeCatalogText('۲٫۵', 'en')).toBe('2.5');
  });

  it('matches whole words only, so a phrase inside a longer word is left alone', () => {
    // «بال» is «Flange»; «بال‌مساوی» (equal-leg) is a different word.
    expect(localizeCatalogText('بال‌مساوی', 'en')).toBe('بال‌مساوی');
    expect(localizeCatalogText('بال', 'en')).toBe('Flange');
  });

  it('prefers the longest phrase («وزن شاخه» before «شاخه»)', () => {
    expect(localizeCatalogText('وزن شاخه', 'en')).toBe('Branch weight');
    expect(localizeCatalogText('متر مربع', 'en')).toBe('m²');
  });

  it('has an entry in every locale for every phrase', () => {
    for (const key of CATALOG_PHRASE_KEYS) {
      for (const locale of NON_FA) {
        // Arabic legitimately spells a few (تومان, مشهد, رول) as Persian does.
        if (locale === 'ar') {
          expect(localizeCatalogText(key, locale)).not.toBe('');
          continue;
        }
        expect(localizeCatalogText(key, locale), `${key} (${locale})`).not.toBe(key);
      }
    }
  });
});

describe('latinDigits', () => {
  it('converts Persian and Arabic-Indic digits and separators', () => {
    expect(latinDigits('۱٬۲۳۴٫۵ ٪ ٦')).toBe('1,234.5 % 6');
  });
});

describe('localizedFactoryName', () => {
  // Names the live catalog listed on 2026-09-19 (65 distinct).
  const LIVE = [
    'فولاد مبارکه', 'کویر کاشان', 'ذوب‌آهن اصفهان', 'فایکو', 'باهنر', 'ظفر بناب', 'آلوم طرح پاسارگاد', 'آناهیتا گیلان',
    'امیرکبیر خزر', 'بافق یزد', 'راد همدان', 'شاهرود', 'شاهین بناب', 'هیربد', 'کاوه تیکمه داش', 'ابرکوه', 'صبا فولاد زاگرس',
    'نیشابور', 'پرشین فولاد', 'کالوپ', 'ابهر', 'قائم اصفهان', 'پارس', 'فولاد متین', 'اراک', 'آلومین گستر', 'چینی', 'تهران شرق',
    'نورد لوله و پوشش نیزار', 'یزد', 'فولاد سبا', 'سپهر ایرانیان', 'بابک', 'مهر اصل', 'تاراز', 'لوله سپاهان', 'خلیج فارس',
    'کیان پرشیا', 'ظهوریان مشهد', 'ورق شهرکرد', 'امیرکبیر کاشان', 'هفت الماس', 'هفت‌الماس', 'وارداتی', 'سپنتا', 'ناب تبریز',
    'اهواز', 'سپاهان', 'لوله سمنان', 'لوله‌سازی اهواز', 'دهشیر یزد', 'جهان فولاد غرب', 'چین', 'کاویان اهواز', 'قطعات اصفهان',
    'فولاد گیلان', 'اکسین اهواز', 'دشتستان', 'شهرکرد', 'کاشان', 'لوله بهفلز سپاهان', 'درپاد تهران', 'نورد لوله ساوه',
    'آریان فولاد', 'جاوید بناب',
  ];

  it('has a Latin form for every mill the live catalog lists', () => {
    expect(LIVE).toHaveLength(65);
    for (const name of LIVE) {
      expect(KNOWN_FACTORY_NAMES, name).toContain(name);
      const en = localizedFactoryName(name, 'en');
      expect(hasUntranslatedScript(en), name).toBe(false);
      expect(localizedFactoryName(name, 'zh')).toBe(en);
    }
  });

  it('keeps the Persian name for fa and ar, and for an unknown mill', () => {
    expect(localizedFactoryName('فولاد مبارکه', 'fa')).toBe('فولاد مبارکه');
    expect(localizedFactoryName('فولاد مبارکه', 'ar')).toBe('فولاد مبارکه');
    expect(localizedFactoryName('کارخانهٔ تازه', 'en')).toBe('کارخانهٔ تازه');
  });
});

describe('formatDisplayDate', () => {
  const d = new Date('2026-09-17T18:23:00Z'); // 21:53 in Tehran

  it('is Jalali with Persian digits for fa (unchanged)', () => {
    expect(formatDisplayDate(d, 'yyyy/MM/dd', 'fa')).toBe('۱۴۰۵/۰۶/۲۶');
  });

  it('is Gregorian with Latin digits, in Tehran time, for every other locale', () => {
    for (const locale of NON_FA) {
      expect(formatDisplayDate(d, 'yyyy/MM/dd', locale)).toBe('2026/09/17');
      expect(formatDisplayDate(d, 'MM/dd', locale)).toBe('09/17');
      expect(formatDisplayDate(d, 'yyyy/MM/dd، HH:mm', locale)).toBe('2026/09/17, 21:53');
    }
  });

  it('uses the Tehran day, not the runtime timezone', () => {
    // 21:00 UTC is already the next day in Tehran (UTC+3:30).
    expect(formatDisplayDate(new Date('2026-09-17T21:00:00Z'), 'yyyy/MM/dd', 'en')).toBe('2026/09/18');
  });
});
