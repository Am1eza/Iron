/**
 * Typed route builders — the single source for all in-app URLs (IA §3).
 * Paths are ASCII slugs (Next.js App Router doesn't reliably match non-ASCII
 * folder segments). All visible labels/content remain Persian; only the URL is
 * Latin. Never hardcode paths in components — use these.
 */
const enc = (s: string) => encodeURIComponent(s);

/**
 * The two dynamic segments whose slug set is fixed in code rather than in the
 * database. Exported so `lib/server/seo/knownPaths.ts` can enumerate their
 * valid URLs (an unknown one must be a real 404, not a cached ghost 200)
 * without importing a page module into middleware. `tracks.tsx`'s TRACK_ORDER
 * and the tool page's own record are asserted equal to these in
 * knownPaths.test.ts, so the two can't drift apart silently.
 */
export const TOOL_SLUGS = ['weight', 'project', 'cost'] as const;
export const COOPERATION_TRACKS = ['analysis', 'supply', 'sell'] as const;
export type ToolSlugName = (typeof TOOL_SLUGS)[number];
export type CooperationTrackName = (typeof COOPERATION_TRACKS)[number];

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
  tool: (t: ToolSlugName) => `/tools/${t}`,

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
  /**
   * Archive page N. The page number lives in the PATH, not in `?page=`,
   * because reading `searchParams` in a Server Component opts the whole route
   * into dynamic rendering in Next 15 — which is why `/blog` and `/news`
   * declared `revalidate = 600` and were nonetheless re-rendered, with two
   * Postgres queries, on literally every visit. Page 1 is always the bare
   * `/blog` so there is exactly one URL for it.
   */
  blogPage: (n: number) => (n <= 1 ? '/blog' : `/blog/page/${n}`),
  newsPage: (n: number) => (n <= 1 ? '/news' : `/news/page/${n}`),

  // Company / cooperation ( /why merged into /about — see next.config redirect )
  about: () => '/about',
  contact: () => '/contact',
  cooperation: (track?: CooperationTrackName) =>
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
    help: () => '/admin/help',
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
  '/about', '/contact', '/terms', '/privacy',
] as const;

/**
 * Sanitize a `?next=` value into a same-site path, or null if it is not one.
 *
 * Rejects absolute URLs, protocol-relative `//evil.com`, AND backslash forms
 * like `/\evil.com` — the WHATWG URL spec requires browsers to normalise `\`
 * to `/` in the authority position, so `Location: /\evil.com` resolves to
 * `https://evil.com`. A `startsWith('//')` check alone does not catch that.
 *
 * Shared so the login form and the silent-refresh route cannot drift apart:
 * both consume a `next` that middleware wrote, and an open redirect on either
 * lands a victim off-site immediately after a genuine, successful login on the
 * real domain — which is exactly what makes it credible.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.includes('\\')) return null;
  return /^\/(?![/\\])/.test(raw) ? raw : null;
}
