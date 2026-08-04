/**
 * Rich, deterministic mock catalog — sample rows for every category & real
 * sub-category, price history for charts, and articles. Values are generated
 * with a seeded PRNG at module load, so SSR and client render identically (no
 * Date.now/Math.random at render time). Swap for the live API later; shapes
 * match `domain.ts`.
 */
import type { Article, MovementDir, PriceRow } from '@/lib/types/domain';
import { categories } from './fixtures';
import { MOCK_CATEGORY_SUBS, type SubCat } from '@/lib/data/nav';

/* ---- seeded PRNG (stable across SSR/CSR) ---- */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mills, sizes and base prices benchmarked against the major Iranian price
 * sites (mid-1404 era). Most-quoted mills first; sizes are the ranges actually
 * sold (rebar 8–32, IPE 12–30, sheet 0.5–40mm, قوطی تا ۱۴۰×۱۴۰ …).
 */
const FACTORIES: Record<string, string[]> = {
  rebar: ['ذوب‌آهن اصفهان', 'فولاد کویر کاشان', 'فولاد میانه', 'فولاد نیشابور', 'ظفر بناب', 'فولاد شاهرود', 'آریان فولاد', 'امیرکبیر خزر', 'سیادن ابهر', 'راد همدان'],
  ibeam: ['ذوب‌آهن اصفهان', 'فایکو', 'یزد احرامیان', 'فولاد اهواز', 'ماهان سپاهان', 'جهان فولاد غرب', 'آریان فولاد', 'ظفر بناب'],
  profile: ['جهان پروفیل پارس', 'تهران شرق', 'نیکان پروفیل', 'کیان پرشیا', 'پروفیل صابری', 'پروفیل یاران', 'فولاد مشهد', 'پایا اصفهان'],
  sheet: ['فولاد مبارکه', 'فولاد سبا', 'اکسین اهواز', 'کاویان اهواز', 'قطعات اصفهان', 'فولاد گیلان', 'هفت‌الماس', 'ورق شهرکرد', 'تاراز', 'امیرکبیر کاشان'],
  'angle-channel': ['ناب تبریز', 'شکفته مشهد', 'آریان فولاد', 'سپهر ایرانیان', 'جاوید بناب', 'ظهوریان مشهد', 'فایکو', 'دهشیر یزد'],
  pipe: ['لوله سپاهان', 'سپنتا', 'نورد لوله ساوه', 'تهران شرق', 'درپاد تهران', 'کالوپ', 'لوله سمنان', 'لوله‌سازی اهواز'],
  wire: ['ذوب‌آهن اصفهان', 'فولاد نطنز', 'فولاد کویر کاشان', 'یزد احرامیان', 'سیادن ابهر', 'امیرکبیر خزر', 'جهان فولاد سیرجان', 'آناهیتا گیلان'],
};
const SIZES: Record<string, string[]> = {
  rebar: ['۸', '۱۰', '۱۲', '۱۴', '۱۶', '۱۸', '۲۰', '۲۲', '۲۵', '۲۸', '۳۲'],
  ibeam: ['۱۲', '۱۴', '۱۶', '۱۸', '۲۰', '۲۲', '۲۴', '۲۷', '۳۰'],
  profile: ['۲۰×۲۰', '۳۰×۳۰', '۴۰×۴۰', '۴۰×۸۰', '۵۰×۵۰', '۶۰×۶۰', '۷۰×۷۰', '۸۰×۸۰', '۹۰×۹۰', '۱۰۰×۱۰۰', '۱۳۵×۱۳۵', '۱۴۰×۱۴۰'],
  sheet: ['۰.۵', '۰.۷', '۱', '۱.۵', '۲', '۲.۵', '۳', '۴', '۵', '۶', '۸', '۱۰', '۱۲', '۱۵', '۲۰', '۲۵', '۳۰', '۴۰'],
  'angle-channel': ['۳', '۴', '۵', '۶', '۸', '۱۰', '۱۲', '۱۴', '۱۶', '۱۸', '۲۰', '۲۲', '۲۴'],
  pipe: ['۱/۲ اینچ', '۳/۴ اینچ', '۱ اینچ', '۱¼ اینچ', '۱½ اینچ', '۲ اینچ', '۲½ اینچ', '۳ اینچ', '۴ اینچ', '۵ اینچ', '۶ اینچ', '۸ اینچ'],
  wire: ['۱.۵', '۲.۵', '۳', '۴', '۵.۵', '۶.۵', '۸', '۱۰', '۱۲'],
};
const BASE_PRICE: Record<string, number> = {
  rebar: 35000,
  ibeam: 38500,
  profile: 44500,
  sheet: 43000,
  'angle-channel': 36000,
  pipe: 48000,
  wire: 39500,
};
const DELIVERY = ['۲۴ ساعت', '۴۸ ساعت', '۷۲ ساعت', 'تحویل فوری'];
const UPDATED_AT = '2026-06-27T08:00:00.000Z';

function faToInt(s: string): number {
  const m = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/\d+/);
  return m ? Number(m[0]) : 10;
}

/** rebar grade per sub-category (A1 plain, A2/A3 deformed, A4 alloy). */
function rebarGrade(subSlug: string): string | undefined {
  if (subSlug === 'plain') return 'A1';
  if (subSlug === 'deformed-a2') return 'A2';
  if (subSlug === 'alloy') return 'A4';
  return 'A3';
}

function rowsFor(categorySlug: string): PriceRow[] {
  const rnd = lcg(hash(categorySlug));
  const allSizes = SIZES[categorySlug] ?? ['۱۴'];
  const factories = FACTORIES[categorySlug] ?? ['کارخانه'];
  const base = BASE_PRICE[categorySlug] ?? 33000;
  const catName = categories.find((c) => c.slug === categorySlug)?.name ?? categorySlug;
  const subs: SubCat[] = MOCK_CATEGORY_SUBS[categorySlug] ?? [{ slug: 'general', name: catName }];
  const rows: PriceRow[] = [];
  let i = 0;

  for (const sub of subs) {
    // Each sub-category gets a deterministic slice of the size range + a price
    // offset, so its table reads like a distinct, realistic product family.
    const start = Math.floor(rnd() * Math.max(1, allSizes.length - 4));
    const count = Math.min(allSizes.length, 4 + Math.floor(rnd() * 4)); // 4..7
    const sizes = allSizes.slice(start, start + count);
    if (sizes.length === 0) sizes.push(allSizes[0]!);
    const subOffset = Math.round((rnd() - 0.45) * 3000);
    const grade = categorySlug === 'rebar' ? rebarGrade(sub.slug) : undefined;

    for (const size of sizes) {
      const factory = factories[Math.floor(rnd() * factories.length)]!;
      const price = Math.round((base + subOffset + (rnd() - 0.4) * 4000) / 50) * 50;
      const pct = Math.round((rnd() - 0.45) * 24) / 10; // -1.x..+1.x
      const dir: MovementDir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
      const weight = Math.round((faToInt(size) ** 2 / 162) * 12 * 10) / 10 || 10;
      const slug = `${categorySlug}-${sub.slug}-${++i}`;
      rows.push({
        id: slug,
        subCategoryId: sub.slug,
        categoryId: categorySlug,
        slug,
        name: `${catName} ${sub.name} ${size}`,
        standard: grade,
        size,
        grade,
        factory,
        theoreticalWeightKg: weight,
        unit: 'kg',
        isActive: true,
        current: {
          skuId: slug,
          price,
          unit: 'kg',
          deliveryTime: DELIVERY[Math.floor(rnd() * DELIVERY.length)]!,
          vatIncluded: false,
          movementPct: pct,
          movementDir: dir,
          updatedAt: UPDATED_AT,
          isStale: false,
        },
      });
    }
  }
  return rows;
}

export const rowsByCategory: Record<string, PriceRow[]> = Object.fromEntries(
  categories.map((c) => [c.slug, rowsFor(c.slug)]),
);

export const allRows: PriceRow[] = Object.values(rowsByCategory).flat();

/** All rows for a category (every sub-category). */
export function getRows(categorySlug: string): PriceRow[] {
  return rowsByCategory[categorySlug] ?? [];
}

/** Rows for one sub-category within a category. */
export function getSubRows(categorySlug: string, subSlug: string): PriceRow[] {
  return getRows(categorySlug).filter((r) => r.subCategoryId === subSlug);
}

export function findSku(slug: string): PriceRow | undefined {
  return allRows.find((r) => r.slug === slug);
}

/**
 * Unique factories/mills for a category, or for one sub-category. Derived from
 * the mock rows so it stays in sync with the tables. Used by the home cascade
 * menu's 3rd level (category → sub-group → factory). Falls back to the full
 * category list if a sub happens to carry fewer than two distinct mills.
 */
export function getFactories(categorySlug: string, subSlug?: string): string[] {
  const namesOf = (rs: PriceRow[]): string[] =>
    [...new Set(rs.map((r) => r.factory).filter((f): f is string => Boolean(f)))];
  const rows = subSlug ? getSubRows(categorySlug, subSlug) : getRows(categorySlug);
  const uniq = namesOf(rows);
  if (subSlug && uniq.length < 2) {
    return namesOf(getRows(categorySlug));
  }
  return uniq;
}

/** Display name for a sub-category slug (or undefined if unknown). */
export function subName(categorySlug: string, subSlug: string): string | undefined {
  return (MOCK_CATEGORY_SUBS[categorySlug] ?? []).find((s) => s.slug === subSlug)?.name;
}

/** A few related SKUs (same category, different sub or size) for cross-sell. */
export function relatedRows(row: PriceRow, n = 4): PriceRow[] {
  return getRows(row.categoryId)
    .filter((r) => r.slug !== row.slug)
    .slice(0, n);
}

/** Deterministic daily price series (last N days) for the chart. */
export function priceSeries(skuSlug: string, currentPrice: number, days = 365): number[] {
  const rnd = lcg(hash('series:' + skuSlug));
  const out: number[] = [];
  let v = currentPrice * (0.86 + rnd() * 0.1); // start below
  for (let i = 0; i < days; i++) {
    v += (rnd() - 0.46) * currentPrice * 0.02;
    v = Math.max(currentPrice * 0.7, Math.min(currentPrice * 1.18, v));
    out.push(Math.round(v));
  }
  out[out.length - 1] = currentPrice; // end exactly at today
  return out;
}

/* ----------------------------- articles ----------------------------- */
export const articles: Article[] = [
  {
    id: 'a1', slug: 'rebar-price-forecast-tir', type: 'blog',
    title: 'پیش‌بینی قیمت میلگرد در تیرماه ۱۴۰۵',
    excerpt: 'بررسی عوامل مؤثر بر قیمت میلگرد و چشم‌انداز بازار در هفته‌های پیش‌رو.',
    status: 'published', source: 'ai', publishAt: '2026-06-26T09:00:00.000Z',
  },
  {
    id: 'a2', slug: 'choosing-rebar-grade', type: 'blog',
    title: 'راهنمای انتخاب گرید میلگرد: A2، A3 یا A4؟',
    excerpt: 'تفاوت گریدهای میلگرد و اینکه برای پروژهٔ شما کدام مناسب است.',
    status: 'published', source: 'ai', publishAt: '2026-06-25T09:00:00.000Z',
  },
  {
    id: 'a3', slug: 'steel-weight-guide', type: 'blog',
    title: 'جدول وزن مقاطع فولادی و فرمول محاسبه',
    excerpt: 'چطور وزن میلگرد، تیرآهن و ورق را دقیق حساب کنیم.',
    status: 'published', source: 'human', publishAt: '2026-06-24T09:00:00.000Z',
  },
  {
    id: 'a4', slug: 'ibeam-vs-box-column', type: 'blog',
    title: 'تیرآهن یا قوطی ستونی؟ راهنمای انتخاب برای اسکلت',
    excerpt: 'مقایسهٔ فنی و اقتصادی تیرآهن و پروفیل ستونی در ساخت اسکلت فلزی.',
    status: 'published', source: 'ai', publishAt: '2026-06-23T09:00:00.000Z',
  },
  {
    id: 'n1', slug: 'mobarakeh-output-record', type: 'news',
    title: 'رکورد تولید فولاد مبارکه در خرداد ۱۴۰۵',
    excerpt: 'فولاد مبارکه از افزایش تولید ورق گرم خبر داد.',
    status: 'published', source: 'ai', publishAt: '2026-06-27T07:00:00.000Z',
  },
  {
    id: 'n2', slug: 'billet-export-update', type: 'news',
    title: 'به‌روزرسانی نرخ شمش صادراتی',
    excerpt: 'تغییرات نرخ شمش فولاد در بازارهای منطقه‌ای.',
    status: 'published', source: 'ai', publishAt: '2026-06-26T07:00:00.000Z',
  },
  {
    id: 'n3', slug: 'tehran-construction-demand', type: 'news',
    title: 'رشد تقاضای آهن‌آلات ساختمانی در تهران',
    excerpt: 'گزارش بازار از افزایش تقاضای میلگرد و تیرآهن.',
    status: 'published', source: 'ai', publishAt: '2026-06-25T07:00:00.000Z',
  },
];

export function articlesByType(type: 'blog' | 'news'): Article[] {
  return articles.filter((a) => a.type === type);
}
export function findArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
