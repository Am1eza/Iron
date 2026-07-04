/**
 * Admin API client — staff-only, always live (admin has no mock mode; the
 * pages are server-gated). Thin typed wrappers over /api/admin/**.
 */
import { http } from '../http';
import type { PriceRow, LineItem, Order, WarehouseItem, Article, MarketValue } from '@/lib/types/domain';

/** Every field is scoped to the caller's permissions server-side — a field is
 * simply absent if the current role can't see that domain (e.g. a content
 * editor never receives `stalePrices` or `totalUsers`). */
export interface AdminStats {
  stalePrices?: number;
  freshPrices?: number;
  newLeads?: number;
  openRequests?: number;
  activeOrders?: number;
  newMessages?: number;
  totalUsers?: number;
  newUsers24h?: number;
  draftArticles?: number;
  aiToday?: { promptTokens: number; completionTokens: number; cacheHitRate: number; violations: number };
}

export interface AdminLead {
  id: string;
  ref: string;
  userId: string | null;
  contactName: string | null;
  contactMobile: string;
  contactVerified: boolean;
  source: string;
  cooperationType: string | null;
  context: Record<string, unknown> | null;
  channelPref: string;
  status: 'new' | 'contacted' | 'won' | 'lost';
  assigneeId: string | null;
  callbackAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProforma {
  id: string;
  ref: string;
  lines: LineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  validUntil: string;
  status: 'active' | 'expired';
  createdAt: string;
}

export interface AdminUserRow {
  id: string;
  mobile: string;
  name?: string;
  role: string;
  clubTier?: string;
  isActive?: boolean;
  createdAt: string;
}

export type ArticleFull = Article & { bodyMd: string; coverUrl?: string };

export const adminApi = {
  stats: () => http.get<{ stats: AdminStats }>('/api/admin/stats'),

  /* pricing */
  pricingGrid: (cat: string, sub?: string) =>
    http.get<{ rows: PriceRow[] }>(`/api/admin/pricing?cat=${encodeURIComponent(cat)}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}`),
  savePrices: (prices: Array<{ skuId: string; price: number; deliveryTime?: string; vatIncluded?: boolean }>) =>
    http.put<{
      results: Array<
        | { ok: true; skuId: string; price: number; movementPct: number | null; movementDir: string }
        | { ok: false; skuId: string; error: string }
      >;
      saved: number;
      failed: number;
    }>('/api/admin/pricing', { prices }),
  saveBillet: (value: number) => http.put<{ value: MarketValue }>('/api/admin/market/billet', { value }),

  /* leads / crm */
  leads: (params: { status?: string; q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    return http.get<{ leads: AdminLead[]; total: number }>(`/api/admin/leads?${qs}`);
  },
  lead: (id: string) =>
    http.get<{ lead: AdminLead; items: Array<LineItem & { id: string }>; notes: Array<{ id: string; authorId: string; text: string; at: string }>; proformas: AdminProforma[] }>(
      `/api/admin/leads/${id}`,
    ),
  updateLead: (id: string, patch: { status?: string; assigneeId?: string | null; callbackAt?: string | null }) =>
    http.patch<{ lead: AdminLead }>(`/api/admin/leads/${id}`, patch),
  addLeadNote: (id: string, text: string) => http.post<{ note: unknown }>(`/api/admin/leads/${id}/notes`, { text }),
  issueProforma: (id: string) => http.post<{ proforma: AdminProforma }>(`/api/admin/leads/${id}/proforma`, {}),
  convertToOrder: (id: string) => http.post<{ order: Order }>(`/api/admin/leads/${id}/order`, {}),

  /* requests + contact */
  requests: (status?: string) =>
    http.get<{ requests: Array<{ id: string; ref: string; userId: string; type: string; title: string; detail?: string; status: string; createdAt: string }>; total: number }>(
      `/api/admin/requests${status ? `?status=${status}` : ''}`,
    ),
  updateRequest: (id: string, status: string) => http.patch<{ request: unknown }>(`/api/admin/requests/${id}`, { status }),
  contactMessages: (status?: string) =>
    http.get<{ messages: Array<{ id: string; name: string; mobile: string; message: string; status: string; createdAt: string }>; total: number }>(
      `/api/admin/contact-messages${status ? `?status=${status}` : ''}`,
    ),
  updateContactMessage: (id: string, status: 'new' | 'handled') =>
    http.patch<{ message: unknown }>(`/api/admin/contact-messages/${id}`, { status }),

  /* orders */
  orders: (params: { status?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    return http.get<{ orders: Order[]; total: number }>(`/api/admin/orders?${qs}`);
  },
  updateOrderStatus: (ref: string, status: string) =>
    http.patch<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(ref)}`, { status }),

  /* warehouse */
  warehouse: (page = 1) =>
    http.get<{ items: Array<WarehouseItem & { userId: string }>; total: number }>(`/api/admin/warehouse?page=${page}`),
  createWarehouseItem: (input: { mobile: string; product: string; sizeLabel?: string; quantityTons: number; monthlyFeeToman?: number }) =>
    http.post<{ item: WarehouseItem }>('/api/admin/warehouse', input),
  updateWarehouseItem: (id: string, patch: { status?: string; monthlyFeeToman?: number; quantityTons?: number }) =>
    http.patch<{ item: WarehouseItem }>(`/api/admin/warehouse/${id}`, patch),

  /* content */
  articles: (params: { status?: string; type?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.type) qs.set('type', params.type);
    return http.get<{ articles: ArticleFull[]; total: number }>(`/api/admin/articles?${qs}`);
  },
  article: (id: string) => http.get<{ article: ArticleFull }>(`/api/admin/articles/${id}`),
  createArticle: (input: { slug: string; type: 'blog' | 'news'; title: string; excerpt?: string; bodyMd?: string }) =>
    http.post<{ article: ArticleFull }>('/api/admin/articles', input),
  updateArticle: (id: string, patch: Partial<{ slug: string; title: string; excerpt: string | null; bodyMd: string; publishAt: string | null; status: 'draft' }>) =>
    http.patch<{ article: ArticleFull }>(`/api/admin/articles/${id}`, patch),
  publishArticle: (id: string, publishAt?: string) =>
    http.post<{ article: ArticleFull }>(`/api/admin/articles/${id}/publish`, publishAt ? { publishAt } : {}),

  /* catalog */
  categories: () => http.get<{ categories: Array<{ id: string; slug: string; name: string; order: number; isActive: boolean }> }>('/api/admin/catalog/categories'),
  subCategories: (categoryId?: string) =>
    http.get<{ subCategories: Array<{ id: string; categoryId: string; slug: string; name: string; order: number; isActive: boolean }> }>(
      `/api/admin/catalog/subcategories${categoryId ? `?categoryId=${categoryId}` : ''}`,
    ),
  skus: (params: { categoryId?: string; subCategoryId?: string; q?: string; all?: boolean; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    if (params.subCategoryId) qs.set('subCategoryId', params.subCategoryId);
    if (params.q) qs.set('q', params.q);
    if (params.all) qs.set('all', 'true');
    if (params.page) qs.set('page', String(params.page));
    return http.get<{ rows: Array<{ sku: Record<string, unknown>; price: Record<string, unknown> | null }>; total: number }>(
      `/api/admin/catalog/skus?${qs}`,
    );
  },
  createSku: (input: Record<string, unknown>) => http.post<{ sku: unknown }>('/api/admin/catalog/skus', input),
  updateSku: (id: string, patch: Record<string, unknown>) => http.patch<{ sku: unknown }>(`/api/admin/catalog/skus/${id}`, patch),
  deactivateSku: (id: string) => http.del<{ ok: true }>(`/api/admin/catalog/skus/${id}`),

  /* users / club / settings / audit */
  users: (params: { role?: string; q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.role) qs.set('role', params.role);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    return http.get<{ users: AdminUserRow[]; total: number }>(`/api/admin/users?${qs}`);
  },
  updateUser: (id: string, patch: { role?: string; isActive?: boolean; name?: string }) =>
    http.patch<{ user: AdminUserRow }>(`/api/admin/users/${id}`, patch),
  clubMembers: (page = 1) =>
    http.get<{ members: Array<{ id: string; userId: string; mobile: string; name?: string; tier: string; joinedAt: string }>; total: number }>(
      `/api/admin/club/members?page=${page}`,
    ),
  setClubTier: (id: string, tier: 'iron' | 'steel' | 'poolad') =>
    http.patch<{ member: unknown }>(`/api/admin/club/members/${id}`, { tier }),
  settings: () => http.get<{ settings: Array<{ key: string; value: unknown; updatedAt: string }> }>('/api/admin/settings'),
  saveSetting: (key: string, value: unknown) => http.put<{ ok: true }>('/api/admin/settings', { key, value }),
  audit: (params: { entityType?: string; cursor?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.entityType) qs.set('entityType', params.entityType);
    if (params.cursor) qs.set('cursor', params.cursor);
    return http.get<{
      entries: Array<{ id: string; actorId: string | null; action: string; entityType: string; entityId: string; before: unknown; after: unknown; at: string }>;
      nextCursor: string | null;
    }>(`/api/admin/audit?${qs}`);
  },
};
