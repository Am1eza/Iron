/**
 * Typed route builders — the single source for all in-app URLs (IA §3).
 * Paths are ASCII slugs (Next.js App Router doesn't reliably match non-ASCII
 * folder segments). All visible labels/content remain Persian; only the URL is
 * Latin. Never hardcode paths in components — use these.
 */
const enc = (s: string) => encodeURIComponent(s);

export const routes = {
  home: () => '/',

  // Catalog
  prices: () => '/prices',
  category: (cat: string) => `/prices/${enc(cat)}`,
  subCategory: (cat: string, sub: string) => `/prices/${enc(cat)}/${enc(sub)}`,
  sku: (cat: string, sub: string, sku: string) => `/prices/${enc(cat)}/${enc(sub)}/${enc(sku)}`,

  // Core
  ai: () => '/ai',
  market: () => '/market',
  tool: (t: 'weight' | 'project' | 'cost') => `/tools/${t}`,

  // Engagement / account
  cart: () => '/cart',
  request: () => '/request',
  warehouse: () => '/warehouse',
  track: () => '/track',
  login: (next?: string) => (next ? `/login?next=${enc(next)}` : '/login'),
  account: (
    tab?: 'favorites' | 'requests' | 'alerts' | 'profile' | 'club' | 'warehouse' | 'orders',
  ) => (tab ? `/account/${tab}` : '/account'),
  club: () => '/club',

  // Content
  blog: (slug?: string) => (slug ? `/blog/${enc(slug)}` : '/blog'),
  news: (slug?: string) => (slug ? `/news/${enc(slug)}` : '/news'),

  // Company / cooperation
  about: () => '/about',
  contact: () => '/contact',
  why: () => '/why',
  cooperation: (track?: 'analysis' | 'supply' | 'sell') =>
    track ? `/cooperation/${track}` : '/cooperation',

  // Utility / legal
  search: (q: string) => `/search?q=${enc(q)}`,
  terms: () => '/terms',
  privacy: () => '/privacy',

  // Admin
  admin: {
    dashboard: () => '/admin',
    desk: () => '/admin/desk',
    pricing: () => '/admin/pricing',
    alerts: () => '/admin/alerts',
    catalog: () => '/admin/catalog',
    leads: () => '/admin/leads',
    warehouse: () => '/admin/warehouse',
    orders: () => '/admin/orders',
    content: () => '/admin/content',
    club: () => '/admin/club',
    users: () => '/admin/users',
    settings: () => '/admin/settings',
    audit: () => '/admin/audit',
    ai: () => '/admin/ai',
    marketing: () => '/admin/marketing',
    seo: () => '/admin/seo',
  },
} as const;

/** Static, indexable routes for the sitemap. */
export const STATIC_INDEXABLE = [
  '/', '/prices', '/ai', '/market',
  '/tools/weight', '/tools/project', '/tools/cost',
  '/warehouse',
  '/club', '/blog', '/news', '/cooperation',
  '/about', '/contact', '/why', '/terms', '/privacy',
] as const;
