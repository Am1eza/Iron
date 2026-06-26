/**
 * Typed route builders — the single source for all in-app URLs (IA §3).
 * Never hardcode Persian paths in components; use these.
 */
const enc = (s: string) => encodeURIComponent(s);

export const routes = {
  home: () => '/',

  // Catalog
  prices: () => '/قیمت',
  category: (cat: string) => `/قیمت/${enc(cat)}`,
  subCategory: (cat: string, sub: string) => `/قیمت/${enc(cat)}/${enc(sub)}`,
  sku: (cat: string, sub: string, sku: string) => `/قیمت/${enc(cat)}/${enc(sub)}/${enc(sku)}`,

  // Core
  ai: () => '/پولادین',
  market: () => '/طلا-و-ارز',
  tool: (t: 'وزن' | 'براورد-پروژه' | 'محاسبه-هزینه') => `/ابزار/${t}`,

  // Engagement / account
  cart: () => '/سبد-استعلام',
  request: () => '/درخواست',
  login: (next?: string) => (next ? `/ورود?next=${enc(next)}` : '/ورود'),
  account: (tab?: 'علاقه-مندی' | 'درخواست-ها' | 'هشدارها' | 'پروفایل' | 'باشگاه') =>
    tab ? `/حساب/${tab}` : '/حساب',
  club: () => '/باشگاه',

  // Content
  blog: (slug?: string) => (slug ? `/وبلاگ/${enc(slug)}` : '/وبلاگ'),
  news: (slug?: string) => (slug ? `/اخبار/${enc(slug)}` : '/اخبار'),

  // Company / cooperation
  about: () => '/درباره-ما',
  contact: () => '/تماس',
  why: () => '/چرا-پولادین',
  cooperation: (track?: 'تحلیل-بازار' | 'تامین' | 'فروش') =>
    track ? `/همکاری/${track}` : '/همکاری',

  // Utility / legal
  search: (q: string) => `/جستجو?q=${enc(q)}`,
  terms: () => '/قوانین',
  privacy: () => '/حریم-خصوصی',

  // Admin
  admin: {
    dashboard: () => '/admin',
    pricing: () => '/admin/pricing',
    catalog: () => '/admin/catalog',
    market: () => '/admin/market',
    leads: () => '/admin/leads',
    content: () => '/admin/content',
    club: () => '/admin/club',
    users: () => '/admin/users',
    settings: () => '/admin/settings',
    audit: () => '/admin/audit',
  },
} as const;

/** Static, indexable routes for the sitemap. */
export const STATIC_INDEXABLE = [
  '/', '/قیمت', '/پولادین', '/طلا-و-ارز',
  '/ابزار/وزن', '/ابزار/براورد-پروژه', '/ابزار/محاسبه-هزینه',
  '/باشگاه', '/وبلاگ', '/اخبار', '/همکاری',
  '/درباره-ما', '/تماس', '/چرا-پولادین', '/قوانین', '/حریم-خصوصی',
] as const;
