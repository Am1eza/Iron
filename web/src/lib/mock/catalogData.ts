/**
 * Rich, deterministic mock catalog — sample rows for every category & real
 * sub-category, price history for charts, and articles. Values are generated
 * with a seeded PRNG at module load, so SSR and client render identically (no
 * Date.now/Math.random at render time). Swap for the live API later; shapes
 * match `domain.ts`.
 */
import type { Article, MovementDir, PriceRow } from '@/lib/types/domain';
import { categories } from './fixtures';
import { CATEGORY_SUBS, type SubCat } from '@/lib/data/nav';

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

const FACTORIES: Record<string, string[]> = {
  rebar: ['ذوب‌آهن', 'نیشابور', 'کاوه', 'ظفربناب', 'میانه'],
  ibeam: ['ذوب‌آهن', 'فایکو', 'ترک', 'کره'],
  profile: ['تهران', 'یاران', 'صدرا', 'جباری'],
  sheet: ['فولاد مبارکه', 'فولاد خوزستان', 'کاویان', 'گیلان'],
  'angle-channel': ['ناب‌تبریز', 'ماهان', 'شکفته', 'فولاد البرز'],
  pipe: ['سپاهان', 'یزد', 'اصفهان', 'تهران'],
  wire: ['امیرکبیر', 'کویر', 'یزد'],
};
const SIZES: Record<string, string[]> = {
  rebar: ['۸', '۱۰', '۱۲', '۱۴', '۱۶', '۱۸', '۲۰', '۲۲', '۲۵', '۲۸', '۳۲'],
  ibeam: ['۱۲', '۱۴', '۱۶', '۱۸', '۲۰', '۲۲', '۲۴', '۲۷', '۳۰'],
  profile: ['۲۰×۲۰', '۳۰×۳۰', '۴۰×۴۰', '۵۰×۵۰', '۶۰×۶۰', '۹۰×۹۰', '۴۰×۸۰'],
  sheet: ['۲', '۳', '۴', '۵', '۶', '۸', '۱۰', '۱۲', '۱۵'],
  'angle-channel': ['۳', '۴', '۵', '۶', '۸', '۱۰', '۱۲'],
  pipe: ['۱.۲ اینچ', '۲ اینچ', '۳ اینچ', '۴ اینچ', '۶ اینچ'],
  wire: ['۵.۵', '۶.۵', '۸', '۱۰', '۱۲'],
};
const BASE_PRICE: Record<string, number> = {
  rebar: 32000,
  ibeam: 34000,
  profile: 36000,
  sheet: 41000,
  'angle-channel': 33000,
  pipe: 38000,
  wire: 30500,
};
const DELIVERY = ['۲۴ ساعت', '۴۸ ساعت', '۷۲ ساعت', 'تحویل فوری'];
const UPDATED_AT = '2026-06-27T08:00:00.000Z';

function faToInt(s: string): number {
  const m = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/\d+/);
  return m ? Number(m[0]) : 10;
}

/** rebar grade per sub-category (A1 plain, A3 deformed, A4 alloy). */
function rebarGrade(subSlug: string): string | undefined {
  if (subSlug === 'plain') return 'A1';
  if (subSlug === 'alloy') return 'A4';
  return 'A3';
}

function rowsFor(categorySlug: string): PriceRow[] {
  const rnd = lcg(hash(categorySlug));
  const allSizes = SIZES[categorySlug] ?? ['۱۴'];
  const factories = FACTORIES[categorySlug] ?? ['کارخانه'];
  const base = BASE_PRICE[categorySlug] ?? 33000;
  const catName = categories.find((c) => c.slug === categorySlug)?.name ?? categorySlug;
  const subs: SubCat[] = CATEGORY_SUBS[categorySlug] ?? [{ slug: 'general', name: catName }];
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

/** Display name for a sub-category slug (or undefined if unknown). */
export function subName(categorySlug: string, subSlug: string): string | undefined {
  return (CATEGORY_SUBS[categorySlug] ?? []).find((s) => s.slug === subSlug)?.name;
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
