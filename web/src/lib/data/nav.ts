/**
 * Navigation model (navigation.md §3/§4/§7) — the single source for header,
 * mega-menu, footer and drawer link sets. Persian labels; URLs via typed `routes`.
 */
import { routes } from '@/lib/routes';

export type NavLink = { label: string; href: string; event?: string };

/** Primary links for the mobile drawer (the only consumer). «قیمت‌ها» was
 *  dropped as redundant: the drawer already has a «محصولات» accordion into the
 *  same catalog, and the mobile bottom tab bar keeps a direct قیمت‌ها entry —
 *  mirrors the desktop header, where the standalone قیمت‌ها link was removed. */
export const PRIMARY_NAV: NavLink[] = [
  { label: 'مشاور هوشمند', href: routes.ai(), event: 'ai_entry' },
  // «تماس» removed — COMPANY_NAV already carries «تماس با ما» → routes.contact(),
  // and the drawer renders both PRIMARY_NAV and COMPANY_NAV, so /contact was
  // listed twice in one drawer.
];

/** «ابزارها ▾» dropdown. */
export const TOOLS_NAV: NavLink[] = [
  { label: 'وزن‌سنج', href: routes.tool('weight') },
  { label: 'برآورد پروژه', href: routes.tool('project') },
  { label: 'محاسبه هزینه', href: routes.tool('cost') },
  { label: 'طلا و ارز', href: routes.market() },
];

/** A sub-category as the UI consumes it. Slugs are ASCII (URL), names Persian
 *  (display). Structural type only — says nothing about where the data is from.
 *  `groupLabel` optional here (mock fixture predates it, entries default to
 *  ungrouped) but present as `string | null` on the live DB-backed shape. */
export type SubCat = { slug: string; name: string; groupLabel?: string | null };

/**
 * ⚠️ MOCK/SEED FIXTURE — **NOT** the live taxonomy. Do not read this to answer
 * "what sub-categories does this site have?"
 *
 * It began as the taxonomy (benchmarked against ahanonline/ahanprice/foolad24)
 * and drove the mega-menu "until the live taxonomy is wired". The live taxonomy
 * has since been wired — into `sub_categories` — and the two have diverged in
 * both directions: this map has 7 top-level slugs, the database has 14 active
 * ones (`sheet` here is `is_active = false` there), and its sub-slugs are the
 * superseded English set. It was never resynced because nothing failed loudly
 * when it drifted.
 *
 * What still legitimately reads it, and why that is safe:
 *
 *  - `lib/mock/catalogData.ts` — generates the fixture catalog. It IS the mock.
 *  - `lib/server/db/seed.ts`   — bootstraps an empty dev/test database. A seed
 *                                is a starting point, not a mirror of prod.
 *  - `lib/server/catalog.ts`   — the `getSubsMap()` answer in mock mode only,
 *                                behind `isLiveCatalog()`.
 *  - `components/catalog/BulkQuote.tsx` — client fallback when the server page
 *                                did not pass `subs`; degraded UI, never SEO.
 *
 * What must NEVER read it: anything published to a crawler or shown as fact —
 * `sitemap.ts`, the RSS feeds, `generateStaticParams`. Those all go through
 * `isLiveCatalog()` / `shouldPrerenderMockParams()` now, and
 * `app/sitemap.test.ts` fails if a fixture slug ever reaches the sitemap again. The `MOCK_` prefix exists so a future call site has to opt in on
 * purpose: it used to be called plain `CATEGORY_SUBS` and sat here next to the
 * real navigation constants, which is precisely how it ended up in the sitemap
 * Google was being served.
 */
export const MOCK_CATEGORY_SUBS: Record<string, SubCat[]> = {
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

/** «انبار مشتریان» — promoted to its own top-level desktop nav item (peer of
 *  «خدمات»), per the requested header structure. Still grouped under «خدمات»
 *  in the footer & mobile drawer via SERVICES_NAV_FULL below, so it never
 *  disappears from those surfaces. */
export const WAREHOUSE_LINK: NavLink = { label: 'انبار مشتریان', href: routes.warehouse() };

/** «خدمات» dropdown — the desktop header renders exactly these (انبار مشتریان
 *  is now a separate top-level item, so it's NOT here). */
export const SERVICES_NAV: NavLink[] = [
  { label: 'پیگیری سفارش', href: routes.track() },
  { label: 'کالا با ابعاد درخواستی', href: routes.cutToSize() },
];

/** «خدمات» as the footer & mobile drawer show it — the desktop-only split of
 *  انبار مشتریان into its own top-level item would otherwise drop it from
 *  those two surfaces, so they render the full set together. */
export const SERVICES_NAV_FULL: NavLink[] = [WAREHOUSE_LINK, ...SERVICES_NAV];

/** «شرکت» — company links. Shared by header dropdown, drawer & footer.
 *  «چرا آهن‌تایم» was merged into «درباره ما» (/why → /about redirect), so it's
 *  no longer a separate entry — the About page now carries the advantages. */
export const COMPANY_NAV: NavLink[] = [
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
/**
 * «مقالات و تحلیل بازار» — the content hub.
 *
 * The site published articles at /blog and /news for months with NOTHING
 * linking to them: not the header, not the footer, not the mobile drawer. They
 * reached the sitemap and therefore Google, but no visitor browsing the site
 * could ever arrive at one. Header, Footer and MobileDrawer all render from
 * these arrays, so this single addition lights up all three surfaces.
 *
 * Labelled «مقالات» rather than «مجله»: the latter is the consumer-retail
 * convention and reads wrong to contractors and traders.
 */
export const CONTENT_NAV: NavLink[] = [
  { label: 'تحلیل و آموزش', href: routes.blog() },
  { label: 'اخبار بازار', href: routes.news() },
];

export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  { title: 'ابزارها', links: TOOLS_NAV },
  { title: 'مقالات', links: CONTENT_NAV },
  // Full set (incl. انبار مشتریان) — the footer keeps every service grouped
  // together even though the desktop navbar splits انبار مشتریان out.
  { title: 'خدمات', links: SERVICES_NAV_FULL },
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
