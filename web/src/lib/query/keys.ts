/** Central query-key factory — one source of truth for cache keys. */
export const queryKeys = {
  market: () => ['market'] as const,
  categories: () => ['categories'] as const,
  category: (slug: string) => ['category', slug] as const,
  table: (category: string, sub: string) => ['table', category, sub] as const,
  sku: (slug: string) => ['sku', slug] as const,
  skuHistory: (slug: string, range: string) => ['sku', slug, 'history', range] as const,
  articles: (type: 'blog' | 'news') => ['articles', type] as const,
  me: () => ['me'] as const,
  myLeads: () => ['me', 'leads'] as const,
  myAlerts: () => ['me', 'alerts'] as const,
} as const;
