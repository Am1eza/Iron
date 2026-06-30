/**
 * Centralized UI strings (fa). A flat, typed dictionary so shared copy lives in one
 * place and is ready to swap per-locale later. Domain/page copy can stay inline;
 * this covers the recurring, cross-cutting labels (actions, nav, states).
 */
export const fa = {
  brand: 'آهن‌تایم',
  tagline: 'اول مشورت، بعد خرید.',

  // actions
  'action.submitRequest': 'ثبت درخواست',
  'action.askAi': 'پرسش از آهن‌تایم',
  'action.viewPrices': 'مشاهدهٔ قیمت‌ها',
  'action.retry': 'تلاش دوباره',
  'action.search': 'جستجو',
  'action.loadMore': 'نمایش بیشتر',
  'action.save': 'ذخیره',
  'action.cancel': 'انصراف',
  'action.close': 'بستن',
  'action.login': 'ورود',
  'action.backHome': 'بازگشت به خانه',

  // nav
  'nav.home': 'خانه',
  'nav.prices': 'قیمت‌ها',
  'nav.ai': 'آهن‌تایم',
  'nav.tools': 'ابزارها',
  'nav.club': 'باشگاه',
  'nav.cooperation': 'همکاری',
  'nav.contact': 'تماس',
  'nav.account': 'حساب من',
  'nav.cart': 'سبد استعلام',

  // states
  'state.loading': 'در حال بارگذاری…',
  'state.empty': 'موردی پیدا نشد',
  'state.error': 'مشکلی پیش آمد',
  'state.offline': 'اتصال اینترنت قطع است',
  'state.stale': 'با تأخیر',
  'state.end': 'پایان فهرست',

  // units / data
  'unit.currency': 'تومان',
  'unit.vat': 'ارزش افزوده',
  'data.delivery': 'زمان تحویل',
  'data.movement': 'نوسان',
  'data.updatedAt': 'آخرین به‌روزرسانی',
} as const;

export type StringKey = keyof typeof fa;
