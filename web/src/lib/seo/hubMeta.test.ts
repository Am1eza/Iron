// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import fa from '../../../messages/fa.json';
import en from '../../../messages/en.json';
import ar from '../../../messages/ar.json';
import zh from '../../../messages/zh.json';
import { hubMeta } from './hubMeta';
import { priceFacts } from './priceFacts';
import type { PriceRow } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';

function row(id: string, price: number, over: Record<string, unknown> = {}): PriceRow {
  return {
    id, subCategoryId: 's', categoryId: 'rebar', slug: id, name: id, size: '۱۴', factory: 'M', unit: 'kg', priceBasis: 'kg',
    theoreticalWeightKg: 14.5,
    current: { skuId: id, price, unit: 'kg', deliveryTime: '', vatIncluded: false, movementDir: 'flat', updatedAt: '2026-09-17T18:23:00Z', confirmedAt: '2026-09-17T18:23:00Z', isStale: false, ...over },
  } as PriceRow;
}
const facts = priceFacts([row('a', 90_000), row('b', 95_000)])!;
const tr = (locale: AppLocale, messages: object) => {
  const t = createTranslator({ locale, messages, namespace: 'pricesFacet' } as never) as unknown as (
    k: string,
    v?: Record<string, string | number>,
  ) => string;
  return (k: string, v?: Record<string, string | number>) => t(k, v);
};

describe('hubMeta', () => {
  it('leads with the head keyword and carries the last-confirmed day and the real range (fa)', () => {
    const m = hubMeta(tr('fa', fa), 'میلگرد', facts, 'fa')!;
    expect(m.title).toBe('قیمت میلگرد امروز (۲۶ شهریور ۱۴۰۵)');
    expect(m.description).toContain('از ۹۰٬۰۰۰ تا ۹۵٬۰۰۰ تومان برای هر کیلوگرم');
    expect(m.description).toContain('۲۶ شهریور ۱۴۰۵');
  });

  it('uses the confirmation day in Tehran time, not the UTC day', () => {
    // 21:00 UTC on the 17th is already the 18th in Tehran.
    const late = priceFacts([row('a', 1, { confirmedAt: '2026-09-17T21:00:00Z' })])!;
    expect(hubMeta(tr('en', en), 'Rebar', late, 'en')!.title).toBe('Rebar Price Today (September 18, 2026)');
  });

  it('is available in every locale', () => {
    expect(hubMeta(tr('en', en), 'Rebar', facts, 'en')!.description).toContain('from 90,000 to 95,000 Toman per kilogram');
    expect(hubMeta(tr('ar', ar), 'حديد التسليح', facts, 'ar')!.title).toContain('سعر حديد التسليح اليوم');
    expect(hubMeta(tr('zh', zh), '螺纹钢', facts, 'zh')!.title).toContain('螺纹钢今日价格');
  });

  it('returns null when nothing is priced, so the caller keeps its plain title', () => {
    expect(hubMeta(tr('fa', fa), 'x', null, 'fa')).toBeNull();
  });
});

describe('priceFacts.example', () => {
  it('is a real kg-priced row with a bar weight', () => {
    expect(facts.example).toEqual({ size: '۱۴', weightKg: 14.5, pricePerKg: 90_000 });
  });
  it('is null when no priced kg row carries a weight', () => {
    expect(priceFacts([row('a', 5, { }), { ...row('b', 6), theoreticalWeightKg: undefined } as PriceRow].map((r) => ({ ...r, theoreticalWeightKg: undefined }) as PriceRow))!.example).toBeNull();
  });
});
