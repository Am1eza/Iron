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
/**
 * Benchmarked against the major Iranian price sites (ahanonline/ahanprice/
 * foolad24 class) — the canonical sub-families each lists per category. The 7
 * top-level categories are fixed; only the sub-taxonomy is enriched.
 */
export const CATEGORY_SUBS: Record<string, SubCat[]> = {
  rebar: [
    { slug: 'deformed', name: 'آجدار A3' },
    { slug: 'deformed-a2', name: 'آجدار A2' },
    { slug: 'plain', name: 'ساده' },
    { slug: 'coil', name: 'کلاف' },
    { slug: 'stirrup', name: 'خاموت' },
    { slug: 'alloy', name: 'آلیاژی' },
  ],
  ibeam: [
    { slug: 'ipe', name: 'IPE' },
    { slug: 'light', name: 'سبک' },
    { slug: 'hea', name: 'هاش سبک (HEA)' },
    { slug: 'heb', name: 'هاش سنگین (HEB)' },
    { slug: 'castellated', name: 'لانه‌زنبوری' },
  ],
  profile: [
    { slug: 'box-square', name: 'قوطی مربع' },
    { slug: 'box-rect', name: 'قوطی مستطیل' },
    { slug: 'column', name: 'ستونی ۱۳۵' },
    { slug: 'z', name: 'پروفیل Z' },
    { slug: 'frame', name: 'درب و پنجره' },
    { slug: 'furniture', name: 'مبلی' },
    { slug: 'galvanized', name: 'گالوانیزه' },
  ],
  sheet: [
    { slug: 'black', name: 'سیاه' },
    { slug: 'oiled', name: 'روغنی' },
    { slug: 'galvanized', name: 'گالوانیزه' },
    { slug: 'pickled', name: 'اسیدشویی' },
    { slug: 'checkered', name: 'آجدار' },
    { slug: 'colored', name: 'رنگی' },
    { slug: 'alloy', name: 'آلیاژی' },
    { slug: 'deck', name: 'عرشه فولادی' },
  ],
  'angle-channel': [
    { slug: 'angle', name: 'نبشی بال مساوی' },
    { slug: 'angle-unequal', name: 'نبشی بال نامساوی' },
    { slug: 'spot', name: 'نبشی لقمه' },
    { slug: 'channel-light', name: 'ناودانی سبک' },
    { slug: 'channel-heavy', name: 'ناودانی سنگین' },
    { slug: 'tbar', name: 'سپری' },
  ],
  pipe: [
    { slug: 'seamless', name: 'مانیسمان' },
    { slug: 'gas', name: 'گازی' },
    { slug: 'industrial', name: 'صنعتی درزدار' },
    { slug: 'scaffold', name: 'داربستی' },
    { slug: 'galvanized', name: 'گالوانیزه' },
    { slug: 'spiral', name: 'اسپیرال' },
    { slug: 'furniture', name: 'مبلی' },
  ],
  wire: [
    { slug: 'coil', name: 'کلاف ساده' },
    { slug: 'coil-ribbed', name: 'کلاف آجدار' },
    { slug: 'wire', name: 'مفتول سیاه' },
    { slug: 'wire-galvanized', name: 'مفتول گالوانیزه' },
    { slug: 'tie', name: 'سیم آرماتوربندی' },
    { slug: 'mesh', name: 'توری' },
  ],
};

/** «خدمات» — commercial services. Shared by header dropdown, drawer & footer. */
export const SERVICES_NAV: NavLink[] = [
  { label: 'انبار مشتریان', href: routes.warehouse() },
  { label: 'پیگیری سفارش', href: routes.track() },
];

/** «شرکت» — company links. Shared by header dropdown, drawer & footer. */
export const COMPANY_NAV: NavLink[] = [
  { label: 'چرا آهن‌تایم', href: routes.why() },
  { label: 'درباره ما', href: routes.about() },
  { label: 'همکاری با ما', href: routes.cooperation() },
  { label: 'تماس با ما', href: routes.contact() },
];

/** «پشتیبانی» — legal/support. Shared by header dropdown, drawer & footer. */
export const SUPPORT_NAV: NavLink[] = [
  { label: 'قوانین', href: routes.terms() },
  { label: 'حریم خصوصی', href: routes.privacy() },
];

/**
 * Footer column groups (navigation.md §7) — built from the SAME shared nav sets
 * the header dropdowns and the mobile drawer consume, so every surface stays in
 * sync from one source of truth.
 */
export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  { title: 'ابزارها', links: TOOLS_NAV },
  { title: 'خدمات', links: SERVICES_NAV },
  { title: 'شرکت', links: COMPANY_NAV },
  { title: 'پشتیبانی', links: SUPPORT_NAV },
];

/** Social / messaging channels (navigation.md §7.5) — hrefs are placeholders. */
export const CHANNELS: NavLink[] = [
  { label: 'تلگرام', href: 'https://t.me/ahantime' },
  { label: 'ایتا', href: 'https://eitaa.com/ahantime' },
  { label: 'اینستاگرام', href: 'https://instagram.com/ahantime' },
  { label: 'واتساپ', href: 'https://wa.me/989121395954' },
];
