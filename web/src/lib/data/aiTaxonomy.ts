/**
 * Shared AI-advisor vocabulary — ONE home for the strings/tables the live
 * server engine and the local fallback engine must agree on byte-for-byte
 * (chip labels are a wire protocol: QuickReply deep-links by exact match).
 */

/** Persian/English keyword → catalog category. Used by the server tools'
 *  resolveCategory and the client fallback's bulk detection. */
export const CATEGORY_ALIASES: { re: RegExp; slug: string; name: string }[] = [
  { re: /rebar|میلگرد/, slug: 'rebar', name: 'میلگرد' },
  { re: /ibeam|beam|تیرآهن|تیراهن|هاش|آی‌بیم|ای بیم/, slug: 'ibeam', name: 'تیرآهن' },
  { re: /sheet|ورق/, slug: 'sheet', name: 'ورق' },
  { re: /profile|پروفیل|قوطی/, slug: 'profile', name: 'پروفیل' },
  { re: /angle|channel|نبشی|ناودانی|سپری/, slug: 'angle-channel', name: 'نبشی و ناودانی' },
  { re: /pipe|لوله/, slug: 'pipe', name: 'لوله' },
  { re: /wire|مفتول|سیم|کلاف|توری/, slug: 'wire', name: 'سیم و مفتول' },
];

/** Quick-reply labels the client maps to deep links (exact-match protocol). */
export const CHIP = {
  proforma: 'دریافت پیش‌فاکتور',
  allPrices: 'همهٔ قیمت‌ها',
  weighTool: 'وزن دقیق را حساب کن',
} as const;

/** Opening intent-first purpose chips. */
export const PURPOSE_CHIPS = [
  'ساختمان مسکونی',
  'سوله یا سازهٔ صنعتی',
  'بازرگانی و فروش',
  'فقط می‌خواهم قیمت ببینم',
];
