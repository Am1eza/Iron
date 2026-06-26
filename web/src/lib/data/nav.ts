/**
 * Navigation model (navigation.md §3/§4/§7) — the single source for header,
 * mega-menu, footer and drawer link sets. Persian labels; URLs via typed `routes`.
 */
import { routes } from '@/lib/routes';

export type NavLink = { label: string; href: string; event?: string };

/** Primary header nav (RTL right→left order). «محصولات» is the mega-menu trigger. */
export const PRIMARY_NAV: NavLink[] = [
  { label: 'قیمت‌ها', href: routes.prices() },
  { label: 'پولادین', href: routes.ai(), event: 'ai_entry' },
  { label: 'وبلاگ', href: routes.blog() },
  { label: 'اخبار', href: routes.news() },
  { label: 'باشگاه', href: routes.club() },
  { label: 'همکاری', href: routes.cooperation() },
  { label: 'تماس', href: routes.contact() },
];

/** «ابزارها ▾» dropdown. */
export const TOOLS_NAV: NavLink[] = [
  { label: 'وزن‌سنج', href: routes.tool('وزن') },
  { label: 'برآورد پروژه', href: routes.tool('براورد-پروژه') },
  { label: 'محاسبه هزینه', href: routes.tool('محاسبه-هزینه') },
  { label: 'طلا و ارز', href: routes.market() },
];

/**
 * Representative sub-categories per category slug — drives the mega-menu columns
 * and the drawer accordion until the live taxonomy is wired. (data-model taxonomy.)
 */
export const CATEGORY_SUBS: Record<string, string[]> = {
  میلگرد: ['آجدار', 'ساده', 'کلاف'],
  تیراهن: ['IPE', 'INP', 'لانه‌زنبوری'],
  پروفیل: ['قوطی', 'پروفیل ساختمانی', 'صنعتی'],
  'ورق-گرم': ['سیاه', 'آجدار', 'API'],
  'ورق-سرد': ['روغنی', 'گالوانیزه', 'رنگی'],
  'نبشی-ناودانی': ['نبشی', 'ناودانی', 'سپری'],
  لوله: ['صنعتی', 'گازی', 'مبلی'],
};

/** Footer column groups (navigation.md §7). */
export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: 'ابزارها',
    links: TOOLS_NAV,
  },
  {
    title: 'شرکت',
    links: [
      { label: 'چرا پولادین', href: routes.why() },
      { label: 'درباره ما', href: routes.about() },
      { label: 'تماس با ما', href: routes.contact() },
      { label: 'همکاری با ما', href: routes.cooperation() },
    ],
  },
  {
    title: 'پشتیبانی',
    links: [
      { label: 'سؤالات متداول', href: routes.about() },
      { label: 'قوانین', href: routes.terms() },
      { label: 'حریم خصوصی', href: routes.privacy() },
    ],
  },
];

/** Social / messaging channels (navigation.md §7.5) — hrefs are placeholders. */
export const CHANNELS: NavLink[] = [
  { label: 'تلگرام', href: 'https://t.me/poladin' },
  { label: 'ایتا', href: 'https://eitaa.com/poladin' },
  { label: 'اینستاگرام', href: 'https://instagram.com/poladin' },
  { label: 'واتساپ', href: 'https://wa.me/989121395954' },
];
