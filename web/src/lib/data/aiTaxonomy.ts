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

/**
 * Opening starter chips — real, common visitor questions, each written to
 * land on a DIFFERENT tool (getPrice / calcWeight / compareFactories /
 * estimateProject) so clicking one is also a first taste of what the
 * advisor can actually do, not just a lead-qualification funnel step.
 */
export const PURPOSE_CHIPS = [
  'قیمت میلگرد امروز چقدره؟',
  'وزن دقیق یه شاخه تیرآهن ۱۴ رو حساب کن',
  '۲۰ تن میلگرد از کدوم کارخونه ارزون‌تره؟',
  'برای یه ساختمان ۱۰۰ متری دو طبقه چقدر آهن لازمه؟',
];
