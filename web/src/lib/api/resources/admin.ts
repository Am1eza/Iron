/**
 * Admin API client — staff-only, always live (admin has no mock mode; the
 * pages are server-gated). Thin typed wrappers over /api/admin/**.
 */
import { http } from '../http';
import type { PriceRow, LineItem, Order, WarehouseItem, Article, MarketValue, SeoMeta } from '@/lib/types/domain';

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

export type ArticleFull = Article & { bodyMd: string; coverUrl?: string; authorId?: string | null };

export interface KpiRes {
  current: number;
  prior: number;
  deltaPct: number | null;
  today: number;
  series: number[];
}
export interface OverviewStatsRes {
  leads: KpiRes;
  proformas: KpiRes & { valueCurrent: number; valuePrior: number; valueDeltaPct: number | null };
  orders: KpiRes;
  newUsers: KpiRes;
  aiConversations: KpiRes;
}
export interface MarketingStatsRes {
  bySource: Array<{ source: string; leads: number; won: number; proformas: number; wonRate: number | null }>;
  funnel: { conversations: number; leads: number; proformas: number; orders: number };
  responseMinutes: { median: number | null; p90: number | null; measured: number };
  repeatRate: { repeat: number; total: number; rate: number | null };
  sms: Array<{ kind: string; status: string; n: number }>;
}
export interface SeoStatsRes {
  score: number;
  published: number;
  drafts: number;
  publishedLast30: number;
  daysSinceLastPublish: number | null;
  titlePassRate: number;
  excerptPassRate: number;
  thinPassRate: number;
  failing: Array<{ id: string; slug: string; title: string; titleOk: boolean; excerptOk: boolean; thinOk: boolean; words: number }>;
  automated: Array<{ label: string; ok: true }>;
}

export interface DeskLead {
  id: string;
  ref: string;
  contactName?: string;
  contactMobile: string;
  status: string;
  source: string;
  createdAt: string;
  callbackAt?: string;
}
export interface DeskRes {
  stats: { assigned: number; active: number; won: number; lost: number; conversionPct: number | null };
  active: DeskLead[];
  callbacks: DeskLead[];
}
export interface StaffMember {
  id: string;
  name?: string;
  mobile: string;
  role: string;
}

export interface PendingVerificationRow {
  userId: string;
  mobile: string;
  name?: string;
  kind: 'id' | 'biz';
  nationalId?: string;
  companyName?: string;
  companyNationalId?: string;
  economicCode?: string;
}

export interface AllowlistEntryRow {
  mobile: string;
  label: string | null;
  addedBy: string | null;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
}

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
  myDesk: () => http.get<DeskRes>('/api/admin/my/desk'),
  staff: () => http.get<{ staff: StaffMember[] }>('/api/admin/staff'),
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
  updateArticle: (
    id: string,
    patch: Partial<{
      slug: string;
      title: string;
      excerpt: string | null;
      bodyMd: string;
      publishAt: string | null;
      status: 'draft';
      coverUrl: string | null;
      authorId: string | null;
      seo: SeoMeta | null;
    }>,
  ) => http.patch<{ article: ArticleFull }>(`/api/admin/articles/${id}`, patch),
  publishArticle: (id: string, publishAt?: string) =>
    http.post<{ article: ArticleFull }>(`/api/admin/articles/${id}/publish`, publishAt ? { publishAt } : {}),

  /* catalog */
  categories: () => http.get<{ categories: Array<{ id: string; slug: string; name: string; order: number; isActive: boolean }> }>('/api/admin/catalog/categories'),
  createCategory: (input: { slug: string; name: string; order?: number }) =>
    http.post<{ category: unknown }>('/api/admin/catalog/categories', input),
  updateCategory: (id: string, patch: Partial<{ slug: string; name: string; order: number; isActive: boolean }>) =>
    http.patch<{ category: unknown }>(`/api/admin/catalog/categories/${id}`, patch),
  deactivateCategory: (id: string) => http.del<{ ok: true }>(`/api/admin/catalog/categories/${id}`),
  subCategories: (categoryId?: string) =>
    http.get<{ subCategories: Array<{ id: string; categoryId: string; slug: string; name: string; order: number; isActive: boolean }> }>(
      `/api/admin/catalog/subcategories${categoryId ? `?categoryId=${categoryId}` : ''}`,
    ),
  createSubCategory: (input: { categoryId: string; slug: string; name: string; order?: number }) =>
    http.post<{ subCategory: unknown }>('/api/admin/catalog/subcategories', input),
  updateSubCategory: (id: string, patch: Partial<{ slug: string; name: string; order: number; isActive: boolean }>) =>
    http.patch<{ subCategory: unknown }>(`/api/admin/catalog/subcategories/${id}`, patch),
  deactivateSubCategory: (id: string) => http.del<{ ok: true }>(`/api/admin/catalog/subcategories/${id}`),
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
  /** Shared image upload (article cover, SKU photo) — content:write or catalog:write. */
  uploadImage: (file: File) => http.upload<{ url: string }>('/api/admin/upload', file),

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
  statsOverview: () => http.get<OverviewStatsRes>('/api/admin/stats/overview'),
  statsMarketing: () => http.get<MarketingStatsRes>('/api/admin/stats/marketing'),
  statsSeo: () => http.get<SeoStatsRes>('/api/admin/stats/seo'),
  statsCohorts: () =>
    http.get<{ columns: string[]; rows: Array<{ label: string; size: number; cells: (number | null)[] }> }>(
      '/api/admin/stats/cohorts',
    ),
  verifications: () => http.get<{ pending: PendingVerificationRow[] }>('/api/admin/verifications'),
  reviewVerification: (userId: string, kind: 'id' | 'biz', decision: 'approved' | 'rejected') =>
    http.patch<{ ok: true; verificationLevel: number }>(`/api/admin/verifications/${userId}`, { kind, decision }),
  allowlist: () =>
    http.get<{ entries: AllowlistEntryRow[] }>('/api/admin/allowlist'),
  addToAllowlist: (mobile: string, label?: string) =>
    http.post<{ entries: AllowlistEntryRow[] }>('/api/admin/allowlist', { mobile, label }),
  removeFromAllowlist: (mobile: string) =>
    http.del<{ ok: true }>(`/api/admin/allowlist/${encodeURIComponent(mobile)}`),
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

  /* AI advisor review — continuous-improvement loop */
  aiFeedback: (params: { rating?: 'up' | 'down'; cursor?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.rating) qs.set('rating', params.rating);
    if (params.cursor) qs.set('cursor', params.cursor);
    return http.get<{
      entries: Array<{
        id: string;
        rating: 'up' | 'down';
        reason: string | null;
        createdAt: string;
        conversationId: string | null;
        messageId: string | null;
        answerText: string | null;
      }>;
      nextCursor: string | null;
      summary: { up: number; down: number; last7dDown: number };
    }>(`/api/admin/ai/feedback?${qs}`);
  },
  aiConversation: (id: string) =>
    http.get<{ messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }> }>(
      `/api/admin/ai/conversations/${id}`,
    ),
  aiCorrections: () =>
    http.get<{
      corrections: Array<{
        id: string;
        question: string;
        answer: string;
        sourceMessageId: string | null;
        isActive: boolean;
        createdAt: string;
      }>;
    }>('/api/admin/ai/corrections'),
  createCorrection: (input: { question: string; answer: string; sourceMessageId?: string }) =>
    http.post<{ correction: unknown }>('/api/admin/ai/corrections', input),
  setCorrectionActive: (id: string, isActive: boolean) =>
    http.patch<{ ok: true }>(`/api/admin/ai/corrections/${id}`, { isActive }),
};
