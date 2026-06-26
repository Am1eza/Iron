/**
 * Navigation model (navigation.md §3/§4/§7) — the single source for header,
 * mega-menu, footer and drawer link sets. Persian labels; URLs via typed `routes`.
 */
import { routes } from '@/lib/routes';

export type NavLink = { label: string; href: string; event?: string };

/** Primary header nav — deliberately minimal (3 essentials). Everything else
 *  lives in the footer + mobile drawer, so the bar stays calm for non-tech users. */
export const PRIMARY_NAV: NavLink[] = [
  { label: 'قیمت‌ها', href: routes.prices() },
  { label: 'مشاور هوشمند', href: routes.ai(), event: 'ai_entry' },
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
    { slug: 'stirrup', name: 'خاموت' },
    { slug: 'alloy', name: 'آلیاژی' },
  ],
  ibeam: [
    { slug: 'ipe', name: 'IPE' },
    { slug: 'hash', name: 'هاش (H)' },
    { slug: 'castellated', name: 'لانه‌زنبوری' },
  ],
  profile: [
    { slug: 'box-industrial', name: 'قوطی صنعتی' },
    { slug: 'box-furniture', name: 'قوطی مبلی' },
    { slug: 'column', name: 'قوطی ستونی' },
    { slug: 'z', name: 'پروفیل Z' },
    { slug: 'c', name: 'پروفیل C' },
    { slug: 'frame', name: 'درب و پنجره' },
  ],
  sheet: [
    { slug: 'black', name: 'سیاه' },
    { slug: 'oiled', name: 'روغنی' },
    { slug: 'galvanized', name: 'گالوانیزه' },
    { slug: 'pickled', name: 'اسیدشویی' },
    { slug: 'checkered', name: 'آجدار' },
    { slug: 'colored', name: 'رنگی' },
    { slug: 'deck', name: 'عرشه فولادی' },
  ],
  'angle-channel': [
    { slug: 'angle', name: 'نبشی' },
    { slug: 'channel', name: 'ناودانی' },
    { slug: 'tbar', name: 'سپری' },
  ],
  pipe: [
    { slug: 'seamless', name: 'مانیسمان' },
    { slug: 'gas', name: 'گازی' },
    { slug: 'industrial', name: 'صنعتی' },
    { slug: 'scaffold', name: 'داربستی' },
    { slug: 'galvanized', name: 'گالوانیزه' },
    { slug: 'furniture', name: 'مبلی' },
  ],
  wire: [
    { slug: 'coil', name: 'کلاف' },
    { slug: 'wire', name: 'مفتول' },
    { slug: 'mesh', name: 'توری' },
    { slug: 'truss', name: 'خرپا' },
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
      { label: 'چرا فولادنو', href: routes.why() },
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
  { label: 'تلگرام', href: 'https://t.me/fooladno' },
  { label: 'ایتا', href: 'https://eitaa.com/fooladno' },
  { label: 'اینستاگرام', href: 'https://instagram.com/fooladno' },
  { label: 'واتساپ', href: 'https://wa.me/989121395954' },
];
