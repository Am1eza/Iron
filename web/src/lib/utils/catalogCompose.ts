/**
 * Auto-composition for the admin product form.
 *
 * The catalog admin is not technical. Every field they can be spared is one
 * fewer chance to invent a fourth spelling of a factory, a slug in Persian, or
 * a theoretical weight that quietly breaks the customer's weight calculator.
 * So the form fills what it can derive and leaves the admin only the choices
 * that are genuinely theirs: which sub-category, which size, which factory.
 */
import { normalizeDigits } from './format';
import { slugify } from './slugify';
import { unitWeightKg } from './weight';

/**
 * Latin slugs for the factories that actually exist in this market.
 *
 * `slugify` transliterates Persian letter-by-letter, which for a factory name
 * yields something like `zvb-ahn-asfhan` — unreadable to a Persian speaker and
 * meaningless to Google, and Persian SEO guidance is explicit that Finglish
 * URLs are the worst of both worlds. These ~40 names are the whole real set,
 * so mapping them once buys a readable URL for every product forever.
 * Anything unmapped falls back to `slugify`.
 */
const FACTORY_SLUG: Record<string, string> = {
  'ذوب‌آهن اصفهان': 'zobahan',
  'ذوب آهن اصفهان': 'zobahan',
  'فولاد کویر کاشان': 'kavir-kashan',
  'فولاد میانه': 'mianeh',
  'فولاد نیشابور': 'neyshabour',
  'ظفر بناب': 'zafar-bonab',
  'فولاد شاهرود': 'shahroud',
  'آریان فولاد': 'aryan',
  'امیرکبیر خزر': 'amirkabir-khazar',
  'سیادن ابهر': 'siadan-abhar',
  'راد همدان': 'rad-hamedan',
  فایکو: 'faico',
  'یزد احرامیان': 'yazd-ahramian',
  'فولاد اهواز': 'ahvaz',
  'ماهان سپاهان': 'mahan-sepahan',
  'جهان فولاد غرب': 'jahan-foolad-gharb',
  'جهان پروفیل پارس': 'jahan-profile-pars',
  'تهران شرق': 'tehran-shargh',
  'نیکان پروفیل': 'nikan',
  'کیان پرشیا': 'kian-persia',
  'پروفیل صابری': 'saberi',
  'پروفیل یاران': 'yaran',
  'فولاد مشهد': 'mashhad',
  'پایا اصفهان': 'paya-esfahan',
  'فولاد مبارکه': 'mobarakeh',
  'فولاد سبا': 'saba',
  'اکسین اهواز': 'oxin-ahvaz',
  'کاویان اهواز': 'kavian-ahvaz',
  'قطعات اصفهان': 'ghataat-esfahan',
  'فولاد گیلان': 'gilan',
  'هفت‌الماس': 'haft-almas',
  'ورق شهرکرد': 'shahrekord',
  تاراز: 'taraz',
  'امیرکبیر کاشان': 'amirkabir-kashan',
  'ناب تبریز': 'nab-tabriz',
  'شکفته مشهد': 'shokoufteh-mashhad',
  'سپهر ایرانیان': 'sepehr-iranian',
  'جاوید بناب': 'javid-bonab',
  'ظهوریان مشهد': 'zohourian-mashhad',
  'دهشیر یزد': 'dehshir-yazd',
  'لوله سپاهان': 'sepahan-pipe',
  سپنتا: 'sepanta',
  'نورد لوله ساوه': 'saveh-pipe',
  'درپاد تهران': 'derpad-tehran',
  کالوپ: 'kaloup',
  'لوله سمنان': 'semnan-pipe',
  'لوله‌سازی اهواز': 'ahvaz-pipe',
  'فولاد نطنز': 'natanz',
  'جهان فولاد سیرجان': 'jahan-foolad-sirjan',
  'آناهیتا گیلان': 'anahita-gilan',
};

export function factorySlug(factory: string): string {
  const key = factory.trim();
  return FACTORY_SLUG[key] ?? slugify(key);
}

/**
 * A product URL built from what the product IS, not from a transliteration of
 * its Persian name: `rebar-14-a3-zobahan`. Stable, readable, and it does not
 * change when the admin rewords the display name.
 */
export function composeSkuSlug(input: {
  categorySlug: string;
  size?: string;
  grade?: string;
  factory?: string;
}): string {
  const parts = [
    input.categorySlug,
    input.size ? normalizeDigits(input.size).replace(/×/g, 'x') : '',
    input.grade ? slugify(input.grade) : '',
    input.factory ? factorySlug(input.factory) : '',
  ];
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** The display name a customer sees, composed the way the catalog already
 *  reads: «میلگرد ۱۴ آجدار A3 ذوب‌آهن اصفهان». */
export function composeSkuName(input: {
  subName?: string;
  size?: string;
  grade?: string;
  factory?: string;
}): string {
  return [input.subName, input.size, input.grade, input.factory]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Theoretical weight of one 12-metre branch, from the standard rebar formula
 * (d²/162 kg per metre). Only meaningful for round bar — rebar and wire — so
 * everything else returns null rather than inventing a number the customer's
 * cost estimate would then be built on.
 */
export function theoreticalWeightFor(categorySlug: string, size?: string): number | null {
  if (!size) return null;
  if (categorySlug !== 'rebar' && categorySlug !== 'wire') return null;
  const d = Number(normalizeDigits(size).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(d) || d <= 0) return null;
  // Same shared formula table as the وزن‌سنج, the API and the AI advisor —
  // an admin-facing default that disagreed with the customer-facing
  // calculator is exactly what this consolidation exists to prevent.
  // rebar = one standard 12 m branch; wire is priced per metre.
  const branch = unitWeightKg(categorySlug === 'rebar' ? 'rebar' : 'wire', {
    diameterMm: d,
    lengthM: categorySlug === 'rebar' ? 12 : 1,
  });
  if (branch === null) return null;
  return Math.round(branch * 10) / 10 || null;
}

/** How this category is actually sold, so the admin does not have to know. */
export function defaultUnitFor(categorySlug: string): 'kg' | 'branch' | 'sheet' | 'meter' {
  switch (categorySlug) {
    case 'rebar':
    case 'ibeam':
    case 'angle-channel':
      return 'branch';
    case 'sheet':
      return 'sheet';
    case 'pipe':
    case 'profile':
      return 'meter';
    default:
      return 'kg';
  }
}
