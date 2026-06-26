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
  { label: 'وزن‌سنج', href: routes.tool('weight') },
  { label: 'برآورد پروژه', href: routes.tool('project') },
  { label: 'محاسبه هزینه', href: routes.tool('cost') },
  { label: 'طلا و ارز', href: routes.market() },
];

/**
 * Representative sub-categories per category slug — drives the mega-menu columns
 * and the drawer accordion until the live taxonomy is wired. Slugs are ASCII (URL);
 * names stay Persian (display). (data-model taxonomy.)
 */
export type SubCat = { slug: string; name: string };
export const CATEGORY_SUBS: Record<string, SubCat[]> = {
  rebar: [
    { slug: 'deformed', name: 'آجدار' },
    { slug: 'plain', name: 'ساده' },
    { slug: 'coil', name: 'کلاف' },
  ],
  ibeam: [
    { slug: 'ipe', name: 'IPE' },
    { slug: 'inp', name: 'INP' },
    { slug: 'castellated', name: 'لانه‌زنبوری' },
  ],
  profile: [
    { slug: 'box', name: 'قوطی' },
    { slug: 'structural', name: 'پروفیل ساختمانی' },
    { slug: 'industrial', name: 'صنعتی' },
  ],
  'hot-sheet': [
    { slug: 'black', name: 'سیاه' },
    { slug: 'checkered', name: 'آجدار' },
    { slug: 'api', name: 'API' },
  ],
  'cold-sheet': [
    { slug: 'oiled', name: 'روغنی' },
    { slug: 'galvanized', name: 'گالوانیزه' },
    { slug: 'colored', name: 'رنگی' },
  ],
  'angle-channel': [
    { slug: 'angle', name: 'نبشی' },
    { slug: 'channel', name: 'ناودانی' },
    { slug: 'tbar', name: 'سپری' },
  ],
  pipe: [
    { slug: 'industrial', name: 'صنعتی' },
    { slug: 'gas', name: 'گازی' },
    { slug: 'furniture', name: 'مبلی' },
  ],
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
