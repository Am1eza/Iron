/**
 * Admin API client — staff-only, always live (admin has no mock mode; the
 * pages are server-gated). Thin typed wrappers over /api/admin/**.
 */
import { http } from '../http';
import type { PriceRow, PricePoint, LineItem, Order, WarehouseItem, Article, MarketValue, SeoMeta } from '@/lib/types/domain';
// The command-palette wire contract lives beside the permission predicate
// that shapes it, so the route and this client cannot drift apart.
export type { AdminSearchHit } from '@/lib/auth/adminSearch';
import type { AdminSearchHit } from '@/lib/auth/adminSearch';
import type { RichDoc } from '@/lib/content/richDoc';

/** Mirrors `commentsRepo.ts`'s `AdminComment` — the moderation queue's own
 *  shape, kept here rather than importing server code into the client
 *  bundle. */
export type AdminComment = {
  id: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  authorName: string | null;
  authorMobile: string | null;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  articleType: 'blog' | 'news';
};

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
  pendingVerifications?: number;
  draftArticles?: number;
  /** Alerts sitting in 'triggered' — fired but not yet paused/re-armed by
   *  anyone (W22). Feeds both the alerts page's summary tile and the nav
   *  badge. */
  triggeredAlerts?: number;
  aiToday?: { promptTokens: number; completionTokens: number; cacheHitRate: number; violations: number };
}

/** The lead's `context` jsonb (server type: LeadContext in db/schema/leads.ts).
 *  `estimate` is spelled out because the CRM list renders it as a column — it
 *  is the ONLY signal on a list row about what goods the lead is even for, and
 *  as `Record<string, unknown>` every read of it needed a blind cast. Prices
 *  are the sum of the line totals at capture time: pre-VAT, and stale the
 *  moment the market moves. Everything else stays an index signature. */
export interface AdminLeadContext {
  estimate?: { totalWeightKg?: number; totalPrice?: number };
  [key: string]: unknown;
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
  context: AdminLeadContext | null;
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

export type ArticleFull = Article & {
  /** Derived from `bodyJson` server-side — read-only as far as the panel is
   *  concerned. See `lib/content/docToMarkdown`. */
  bodyMd: string;
  bodyJson: RichDoc | null;
  coverUrl?: string;
  authorId?: string | null;
};

export interface AdminRedirect {
  id: string;
  fromPath: string;
  toPath: string;
  permanent: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Search Console connection state (US-14.4). Carries no token — see the
 *  route's doc comment; `searchConsoleStatus()` selects displayable fields. */
export interface SearchConsoleStatusDto {
  /** Server has the Google Cloud credentials. False = feature hidden. */
  configured: boolean;
  /** Someone has completed the OAuth consent. */
  connected: boolean;
  siteUrl: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  siteUrlMismatch: boolean;
}

/** What the per-article metrics endpoint returns — deliberately NARROWER than
 *  `SearchConsoleStatusDto`: that one carries the server's `GSC_SITE_URL`, and
 *  the article panel is `content:write` while the connection screen is
 *  `settings:write`. */
export interface SearchConsolePanelStatusDto {
  configured: boolean;
  connected: boolean;
  lastError: string | null;
}

export interface SearchConsoleQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  /** 0–1, not a percentage — the UI formats it. */
  ctr: number;
  position: number;
}

export interface SearchConsoleMetricsDto {
  path: string;
  rows: SearchConsoleQueryRow[];
  periodStart: string | null;
  periodEnd: string | null;
  fetchedAt: string | null;
}

export interface AdminAlertRow {
  id: string;
  mobile: string;
  name: string | null;
  target: { type: 'sku'; skuId: string; label?: string } | { type: 'market'; key: string; label?: string };
  op: 'below' | 'above';
  threshold: number;
  channel: string;
  status: 'active' | 'triggered' | 'paused';
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Current SKU price / market value, and whether that feed is flagged
   *  stale (W22) — lets ops see how close an alert is to firing, and WHY a
   *  seemingly-close one hasn't. */
  currentValue: number | null;
  isStale: boolean;
}

export interface AlertTierCaps {
  base: number;
  iron: number;
  steel: number;
  poolad: number;
}

export interface DashboardStatsRes {
  range: number;
  revenue: { current: number; prior: number; deltaPct: number | null; count: number; avgDeal: number };
  leads: { current: number; prior: number; deltaPct: number | null };
  orders: { current: number; prior: number; deltaPct: number | null };
  conversion: { current: number | null; prior: number | null; deltaPts: number | null };
  trend: Array<{ day: string; value: number; count: number }>;
  funnel: { conversations: number; leads: number; proformas: number; orders: number };
  bySource: Array<{ source: string; leads: number; won: number; wonRate: number | null }>;
  leadStatus: Array<{ status: string; n: number }>;
  orderStatus: Array<{ status: string; n: number }>;
  topProducts: Array<{ name: string; qty: number; value: number }>;
  team: Array<{ id: string; name: string; leads: number; won: number; wonRate: number | null; value: number }>;
  health: { stalePrices: number; smsFailed24h: number; expiringProformas: number; unassignedLeads: number };
}
/** One row of either attribution breakdown — entry form or campaign. Same
 *  columns and same per-lead meaning, so one table renders both. */
export interface AttributionRow {
  key: string;
  leads: number;
  /** Leads that reached a proforma, NOT the number of proformas. */
  withProforma: number;
  won: number;
  wonRate: number | null;
  /** Toman booked on won leads — counts alone can't tell ten small deals
   *  from one large one. */
  wonToman: number;
}

export interface MarketingStatsRes {
  range: number;
  /** Which on-site form produced the lead — NOT a marketing channel. */
  byEntryForm: AttributionRow[];
  /** First-touch campaign attribution (W28). */
  byCampaign: AttributionRow[];
  untaggedLeads: number;
  /** Starts at the lead: AI conversations are not an upstream stage of it. */
  funnel: { leads: number; proformas: number; orders: number };
  aiConversations: number;
  responseMinutes: { median: number | null; p90: number | null; measured: number };
  repeatRate: { repeat: number; total: number; rate: number | null };
  sms: Array<{ kind: string; status: string; n: number }>;
  /** Standing call list — deliberately not windowed by `range`. */
  dormant: Array<{
    userId: string;
    name: string | null;
    mobile: string;
    lastOrderAt: string;
    daysSince: number;
    ordersTotal: number;
    lifetimeToman: number;
  }>;
  /** From Matomo. Null when unconfigured or unreachable — render without it. */
  traffic: {
    visits: number;
    uniqueVisitors: number;
    bounceRatePct: number | null;
    byReferrerType: Array<{ label: string; visits: number }>;
  } | null;
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
  failing: Array<{
    id: string;
    slug: string;
    title: string;
    type: 'blog' | 'news';
    titleOk: boolean;
    excerptOk: boolean;
    thinOk: boolean;
    words: number;
  }>;
  /** True count before `failing` is capped to 30 — compare against
   *  `failing.length` to show "N more not shown" instead of silently
   *  understating how much work is left. */
  failingTotal: number;
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
  /** Decided server-side against one clock, so every consumer agrees on what
   *  "late" means regardless of when it rendered. */
  isOverdue: boolean;
}
/** A server-capped list plus the honest numbers behind it: `total` is the real
 *  match count, so the UI can say "showing 30 of 214" instead of silently
 *  truncating (see DeskList in leadsRepo). */
export interface DeskList {
  rows: DeskLead[];
  total: number;
  hasMore: boolean;
  limit: number;
}
export interface DeskRes {
  stats: { assigned: number; active: number; won: number; lost: number; conversionPct: number | null };
  active: DeskList;
  /** Split, not one sorted list: overdue callbacks used to fill the whole cap
   *  and starve upcoming ones entirely for a rep with a backlog. */
  callbacks: { overdue: DeskList; upcoming: DeskList };
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
  /** The role this mobile is GRANTED (what it becomes at next login) — not
   *  necessarily what the account holds right now (`userRole`). */
  role: 'operator' | 'sales' | 'content' | 'catalog' | 'admin';
  addedBy: string | null;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
}

/** Mirror of EXPORT_MAX_ROWS in app/api/admin/leads/export/route.ts. The
 *  server truncates silently — a 6,000-lead range downloads as 5,000 rows with
 *  no marker in the CSV — so the toolbar has to say it BEFORE the click. Keep
 *  the two numbers equal. */
export const LEADS_EXPORT_MAX_ROWS = 5000;

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  order: number;
  iconId: string;
  imageUrl: string | null;
  isActive: boolean;
  /** Active descendants — the confirm dialog states these before hiding. */
  subCount: number;
  skuCount: number;
}

export interface AdminSubCategory {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  /** Display-only cluster label, not a real hierarchy level — see catalog.ts. Null = no grouping. */
  groupLabel: string | null;
  order: number;
  isActive: boolean;
  skuCount: number;
}

export interface AdminSku {
  id: string;
  subCategoryId: string;
  categoryId: string;
  slug: string;
  name: string;
  standard: string | null;
  size: string | null;
  grade: string | null;
  factory: string | null;
  theoreticalWeightKg: number | null;
  unit: 'kg' | 'branch' | 'sheet' | 'meter';
  imageUrl: string | null;
  isActive: boolean;
  /** Category IDs this product is ALSO listed under, beyond its own home
   *  above — e.g. a sheet-steel product also shown under «استیل». */
  crossListedCategoryIds: string[] | null;
}

/** Nullable, not optional: `undefined` is "leave alone", `null` is "clear it".
 *  Sending undefined for an emptied box is what used to make the field
 *  un-clearable while still reporting success. */
export interface AdminSkuInput {
  subCategoryId: string;
  slug: string;
  name: string;
  standard?: string | null;
  size?: string | null;
  grade?: string | null;
  factory?: string | null;
  theoreticalWeightKg?: number | null;
  unit?: 'kg' | 'branch' | 'sheet' | 'meter';
  imageUrl?: string | null;
  crossListedCategoryIds?: string[] | null;
}

export const adminApi = {
  stats: () => http.get<{ stats: AdminStats }>('/api/admin/stats'),

  /* comments moderation (US-14.8) */
  comments: {
    list: (status?: 'pending' | 'approved' | 'rejected') =>
      http.get<{ comments: AdminComment[] }>(
        `/api/admin/comments${status ? `?status=${status}` : ''}`,
      ),
    moderate: (id: string, status: 'approved' | 'rejected') =>
      http.patch<{ ok: true }>(`/api/admin/comments/${id}`, { status }),
  },

  /* pricing */
  pricingGrid: (cat: string, sub?: string) =>
    // `hiddenByTaxonomy` = active products of this category that no public
    // page (and no row below) can show, because their sub-category was
    // deactivated underneath them. The grid surfaces it rather than
    // presenting an empty table as "this category has no products".
    http.get<{ rows: PriceRow[]; hiddenByTaxonomy: number }>(
      `/api/admin/pricing?cat=${encodeURIComponent(cat)}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}`,
    ),
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
  /** Public endpoint (no admin gate) — reused here for the pricing-grid row sparkline (US-17.6). */
  skuHistory: (slug: string, range = '30d') =>
    http.get<{ points: Array<{ price: number; at: string }> }>(
      `/api/sku/${encodeURIComponent(slug)}/history?range=${range}`,
    ),
  /** Batched history for the pricing grid — ONE request for every visible
   *  row's sparkline instead of one per row. */
  skuHistoryBatch: (slugs: string[], range = '30d') =>
    http.post<{ series: Record<string, number[]> }>('/api/admin/pricing/history', { slugs, range }),
  /** Admin-gated, `no-store` per-SKU drilldown — the public `skuHistory`
   *  above is edge-cached for 5 minutes, which is exactly wrong right after
   *  an operator corrects a price. */
  skuHistoryAdmin: (slug: string, range = '90d') =>
    http.get<{ points: PricePoint[]; range: string }>(
      `/api/admin/pricing/history/${encodeURIComponent(slug)}?range=${encodeURIComponent(range)}`,
    ),

  /* leads / crm */
  leads: (
    params: {
      status?: string;
      assignee?: string;
      q?: string;
      source?: string;
      page?: number;
      perPage?: number;
      from?: string;
      to?: string;
      /** Server defaults to 'urgency' when omitted — see the route's doc. */
      sort?: 'urgency' | 'newest';
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.assignee) qs.set('assignee', params.assignee);
    if (params.q) qs.set('q', params.q);
    if (params.source) qs.set('source', params.source);
    if (params.page) qs.set('page', String(params.page));
    if (params.perPage) qs.set('perPage', String(params.perPage));
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.sort) qs.set('sort', params.sort);
    return http.get<{ leads: AdminLead[]; total: number }>(`/api/admin/leads?${qs}`);
  },
  /** Not fetched via `http` — the browser navigates straight to this URL to
   *  download the CSV, same query params as `leads()`.
   *
   *  `assignee` used to be dropped here while `leads()` sent it: with
   *  «سرنخ‌های من» on, the rep saw their own 12 leads on screen and downloaded
   *  all 4,000 of everyone's, with nothing in the file saying so. The
   *  parameter list is deliberately identical to `leads()`' filter half —
   *  anything the list can filter by, the export must carry. */
  leadsExportUrl: (params: { status?: string; assignee?: string; q?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.assignee) qs.set('assignee', params.assignee);
    if (params.q) qs.set('q', params.q);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    return `/api/admin/leads/export?${qs}`;
  },
  lead: (id: string) =>
    http.get<{
      lead: AdminLead;
      // `currentPrice` (W23): the live catalog price for this item's SKU
      // right now — compare against `unitPrice` (frozen at lead-creation
      // time) to see if the price moved since. Null for a custom/no-SKU
      // line, or a SKU whose price was never entered.
      items: Array<LineItem & { id: string; currentPrice: number | null }>;
      notes: Array<{ id: string; authorId: string; text: string; at: string }>;
      proformas: AdminProforma[];
    }>(`/api/admin/leads/${id}`),
  updateLead: (id: string, patch: { status?: string; assigneeId?: string | null; callbackAt?: string | null }) =>
    http.patch<{ lead: AdminLead }>(`/api/admin/leads/${id}`, patch),
  addLeadNote: (id: string, text: string) => http.post<{ note: unknown }>(`/api/admin/leads/${id}/notes`, { text }),
  /** Other live leads sharing this one's NORMALISED mobile, within
   *  `windowDays` of its own `createdAt` (exact match only — never fuzzy).
   *  `leads:read`. */
  leadDuplicates: (id: string) =>
    http.get<{
      windowDays: number;
      subjectHasActiveProforma: boolean;
      candidates: Array<{
        id: string;
        ref: string;
        status: AdminLead['status'];
        assigneeId: string | null;
        contactName: string | null;
        createdAt: string;
        itemCount: number;
        noteCount: number;
        proformaCount: number;
        hasActiveProforma: boolean;
      }>;
    }>(`/api/admin/leads/${id}/duplicates`),
  /** Fold `loserId` into `id`: children move, the loser is archived. THERE IS
   *  NO UNDO. Requires `leads:manage`, and the server re-checks the shared
   *  mobile and the no-active-proforma precondition from the locked rows — the
   *  client sends nothing but two ids. */
  mergeLead: (id: string, loserId: string) =>
    http.post<{
      winner: { id: string; ref: string };
      loser: { id: string; ref: string };
      moved: { items: number; notes: number; proformas: number; requests: number };
    }>(`/api/admin/leads/${id}/merge`, { loserId }),
  /** `unitPrice`: omit = keep, `null` = «بدون قیمت» (stores NULL price AND
   *  NULL line total), a number = that price. `0` is NOT "unpriced" — the
   *  route 400s it on purpose, so this type has to be able to say `null` or
   *  the caller has no way to clear a price at all. */
  updateLeadItem: (leadId: string, itemId: string, patch: { qty?: number; unitPrice?: number | null }) =>
    http.patch<{ item: LineItem & { id: string } }>(`/api/admin/leads/${leadId}/items/${itemId}`, patch),
  issueProforma: (id: string, discountToman?: number) =>
    http.post<{ proforma: AdminProforma }>(`/api/admin/leads/${id}/proforma`, discountToman ? { discountToman } : {}),
  /** The proforma register — every issued proforma across all leads. */
  proformas: (params: { status?: 'active' | 'expired' | 'cancelled'; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    return http.get<{
      proformas: Array<{
        id: string;
        ref: string;
        leadId: string;
        leadRef: string;
        leadStatus: 'new' | 'contacted' | 'won' | 'lost';
        contactName: string | null;
        contactMobile: string;
        total: number;
        discountToman: number;
        validUntil: string;
        status: 'active' | 'expired' | 'cancelled';
        createdAt: string;
      }>;
      total: number;
    }>(`/api/admin/proformas?${qs}`);
  },
  myDesk: () => http.get<DeskRes>('/api/admin/my/desk'),
  staff: () => http.get<{ staff: StaffMember[] }>('/api/admin/staff'),
  convertToOrder: (id: string) => http.post<{ order: Order }>(`/api/admin/leads/${id}/order`, {}),

  /* requests + contact */
  requests: (params: { status?: string; type?: string; page?: number; perPage?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.type) qs.set('type', params.type);
    if (params.page) qs.set('page', String(params.page));
    if (params.perPage) qs.set('perPage', String(params.perPage));
    return http.get<{
      // `leadId` was already on the wire (the repo selects the whole row) but
      // absent from this type, so the inbox had no way to reach the lead a
      // request belongs to — and since issuing a proforma now writes this
      // row's status, the rep needs one click to the thing that wrote it.
      // W20: the repo now joins `users` in, so every row carries the
      // customer's identity — the inbox no longer forces a separate lookup.
      requests: Array<{
        id: string;
        ref: string;
        userId: string;
        type: string;
        title: string;
        detail?: string;
        status: string;
        leadId: string | null;
        createdAt: string;
        customerName: string | null;
        customerMobile: string;
      }>;
      total: number;
    }>(`/api/admin/requests?${qs}`);
  },
  updateRequest: (id: string, status: string) => http.patch<{ request: unknown }>(`/api/admin/requests/${id}`, { status }),
  contactMessages: (params: { status?: string; page?: number; perPage?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.perPage) qs.set('perPage', String(params.perPage));
    return http.get<{
      messages: Array<{
        id: string;
        name: string;
        mobile: string;
        message: string;
        status: string;
        reply: string | null;
        repliedAt: string | null;
        createdAt: string;
      }>;
      total: number;
    }>(`/api/admin/contact-messages?${qs}`);
  },
  updateContactMessage: (id: string, status: 'new' | 'handled') =>
    http.patch<{ message: unknown }>(`/api/admin/contact-messages/${id}`, { status }),
  replyToContactMessage: (id: string, reply: string) =>
    http.post<{ message: unknown }>(`/api/admin/contact-messages/${id}/reply`, { reply }),

  /* orders */
  orders: (params: { status?: string; page?: number; cancelled?: boolean; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.cancelled) qs.set('cancelled', 'true');
    if (params.q) qs.set('q', params.q);
    return http.get<{
      orders: Array<
        Order & {
          leadId: string | null;
          customerName: string | null;
          customerMobile: string | null;
          /** Drives the client-side canActOnAssignedRecord check — see LeadDetail's
           *  identical pattern (W16/W17): hide a control rather than let the API 403 it. */
          leadAssigneeId: string | null;
        }
      >;
      total: number;
    }>(`/api/admin/orders?${qs}`);
  },
  /** 403 `order_forbidden` when the actor isn't the source lead's assignee
   *  and doesn't hold leads:manage (W17) — the UI should hide the control
   *  pre-emptively (see leadAssigneeId above) rather than rely on this. */
  updateOrderStatus: (ref: string, status: string) =>
    http.patch<{ order: Order; smsSent?: boolean }>(`/api/admin/orders/${encodeURIComponent(ref)}`, { status }),
  updateOrderShipping: (ref: string, patch: { trackingNumber?: string; carrierName?: string }) =>
    http.patch<{ order: Order; smsSent?: boolean }>(`/api/admin/orders/${encodeURIComponent(ref)}`, patch),
  /** Requires leads:manage, not leads:write, as of W17 — same tier as
   *  archiving a lead. A leads:write-only rep gets 404 (apiGuard's
   *  insufficient-permission convention), so hide this control for them. */
  cancelOrder: (ref: string) => http.del<{ ok: true; smsSent?: boolean }>(`/api/admin/orders/${encodeURIComponent(ref)}`),

  /* warehouse (W20 — search/filter/pagination, intake details, void/paid) */
  warehouse: (params: { page?: number; status?: string; q?: string; includeDeleted?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.status) qs.set('status', params.status);
    if (params.q) qs.set('q', params.q);
    if (params.includeDeleted) qs.set('includeDeleted', 'true');
    return http.get<{
      items: Array<WarehouseItem & { userId: string; customerMobile: string; customerName: string | null }>;
      total: number;
    }>(`/api/admin/warehouse?${qs}`);
  },
  createWarehouseItem: (input: {
    mobile: string;
    customerName?: string;
    product: string;
    sizeLabel?: string;
    quantityTons: number;
    monthlyFeeToman?: number;
    arrivedAt?: string;
    location?: string;
    intakeNote?: string;
    contractRef?: string;
    insured?: boolean;
    leadId?: string;
    requestId?: string;
  }) =>
    http.post<{ item: WarehouseItem; customer: { id: string; name: string | null; mobile: string }; registeredNewCustomer: boolean }>(
      '/api/admin/warehouse',
      input,
    ),
  updateWarehouseItem: (
    id: string,
    patch: Partial<{
      status: string;
      monthlyFeeToman: number;
      quantityTons: number;
      location: string | null;
      contractRef: string | null;
      insured: boolean;
      arrivedAt: string | null;
      movementNote: string;
    }>,
  ) => http.patch<{ item: WarehouseItem }>(`/api/admin/warehouse/${id}`, patch),
  /** `force`: forfeit and delete even with an unsettled balance — omit to get
   *  a 409 naming the amount owed first (W20). */
  deleteWarehouseItem: (id: string, force = false) =>
    http.del<{ ok: true }>(`/api/admin/warehouse/${id}${force ? '?force=true' : ''}`),
  warehouseMovements: (warehouseItemId: string) =>
    http.get<{ movements: Array<{ id: string; kind: string; deltaTons: number; quantityAfterTons: number; note: string | null; createdAt: string }> }>(
      `/api/admin/warehouse/${warehouseItemId}/movements`,
    ),
  /** The intake queue (W21) — customer-submitted warehouse requests not yet
   *  received. This is the entry point for the whole flow: a rep works from
   *  this list into "دریافت به انبار", not the other way around. */
  pendingWarehouseRequests: () =>
    http.get<{
      requests: Array<{
        id: string;
        ref: string;
        leadId: string | null;
        customerName: string | null;
        customerMobile: string;
        product: string | null;
        quantityTons: number | null;
        duration: string | null;
        note: string | null;
        createdAt: string;
      }>;
    }>('/api/admin/warehouse/requests'),

  /* warehouse settlements (US-08.5, hardened W20) — a real per-item billing
   * ledger, not a point-in-time report: each settlement freezes the period +
   * qty/fee snapshot it covers; mistakes are corrected with a reversing
   * entry (void), never edited or deleted. */
  /** `grandTotalUnsettledToman` is the server's own sum over every active
   *  item — authoritative, unlike a client-side reduce over the rows that
   *  happened to load. `truncated` means the item cap was hit and the figures
   *  cover only part of the warehouse. */
  settlementCustomers: () =>
    http.get<{
      customers: Array<{ userId: string; name: string | null; mobile: string; activeItemCount: number; totalUnsettledToman: number }>;
      grandTotalUnsettledToman: number;
      truncated: boolean;
    }>('/api/admin/warehouse/settlements/customers'),
  /** `history` stays a plain array (additive paging fields alongside it), so
   *  this stayed source-compatible for existing readers. */
  settlementsForCustomer: (userId: string, historyPage = 1) =>
    http.get<{
      user: { id: string; name: string | null; mobile: string };
      unsettled: Array<{
        warehouseItemId: string;
        periodFrom: string;
        periodTo: string;
        days: number;
        quantityTons: number;
        monthlyFeeToman: number;
        amountToman: number;
      }>;
      history: Array<{
        id: string;
        warehouseItemId: string;
        periodFrom: string;
        periodTo: string;
        quantityTons: number;
        monthlyFeeToman: number;
        amountToman: number;
        note: string | null;
        actorId: string | null;
        paidAt: string | null;
        paymentNote: string | null;
        voidedAt: string | null;
        voidsSettlementId: string | null;
        createdAt: string;
      }>;
      historyTotal: number;
      historyPage: number;
      historyPerPage: number;
      /** Settlement ids that are their item's current latest (non-voided) —
       *  the only ones voidSettlement will actually accept; the UI uses this
       *  to not offer «ابطال» on a row that will just 409. */
      latestSettlementIds: string[];
    }>(`/api/admin/warehouse/settlements?userId=${userId}&historyPage=${historyPage}`),
  createSettlement: (warehouseItemId: string, note?: string, periodTo?: string) =>
    http.post<{ settlement: unknown }>('/api/admin/warehouse/settlements', { warehouseItemId, note, periodTo }),
  voidSettlement: (id: string, reason?: string) =>
    http.patch<{ voided: unknown; reversal: unknown }>(`/api/admin/warehouse/settlements/${id}`, { action: 'void', reason }),
  markSettlementPaid: (id: string, note?: string) =>
    http.patch<{ settlement: unknown }>(`/api/admin/warehouse/settlements/${id}`, { action: 'paid', note }),

  /* content */
  articles: (params: { status?: string; type?: string; q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.type) qs.set('type', params.type);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    return http.get<{ articles: ArticleFull[]; total: number }>(`/api/admin/articles?${qs}`);
  },
  article: (id: string) => http.get<{ article: ArticleFull }>(`/api/admin/articles/${id}`),
  createArticle: (input: {
    slug: string;
    type: 'blog' | 'news';
    title: string;
    excerpt?: string;
    bodyJson?: RichDoc;
    tags?: string[];
    relatedCategoryIds?: string[];
    relatedNewsTopicIds?: string[];
    faq?: { question: string; answer: string }[];
    /** Accepted on create since US-14.4 — see `articleSeoSchema`. */
    seo?: SeoMeta | null;
  }) => http.post<{ article: ArticleFull }>('/api/admin/articles', input),
  updateArticle: (
    id: string,
    patch: Partial<{
      slug: string;
      // Moving a misfiled post between blog and news used to require
      // delete+recreate, and DELETE refuses anything already published.
      type: 'blog' | 'news';
      title: string;
      excerpt: string | null;
      bodyJson: RichDoc;
      publishAt: string | null;
      status: 'draft';
      coverUrl: string | null;
      authorId: string | null;
      tags: string[];
      relatedCategoryIds: string[];
      relatedNewsTopicIds: string[];
      faq: { question: string; answer: string }[];
      seo: SeoMeta | null;
    }>,
  ) => http.patch<{ article: ArticleFull }>(`/api/admin/articles/${id}`, patch),
  publishArticle: (id: string, publishAt?: string) =>
    http.post<{ article: ArticleFull }>(`/api/admin/articles/${id}/publish`, publishAt ? { publishAt } : {}),
  /** Draft only — the server rejects a published/scheduled article (unpublish first). */
  deleteArticle: (id: string) => http.del<{ ok: true }>(`/api/admin/articles/${id}`),

  /* redirects (US-14.3) — old-path → new-path, enforced from middleware.ts.
   * No server-side filter exists, so the article drawer's "is this URL
   * already redirected?" check filters this full list client-side; the
   * table is small enough (site-wide redirect count, not per-article) that
   * this costs nothing in practice. */
  redirects: () => http.get<{ redirects: AdminRedirect[] }>('/api/admin/seo/redirects'),
  createRedirect: (input: { fromPath: string; toPath: string; permanent?: boolean }) =>
    http.post<{ redirect: AdminRedirect }>('/api/admin/seo/redirects', input),
  updateRedirect: (id: string, patch: { toPath?: string; permanent?: boolean }) =>
    http.patch<{ redirect: AdminRedirect }>(`/api/admin/seo/redirects/${id}`, patch),
  deleteRedirect: (id: string) => http.del<{ ok: true }>(`/api/admin/seo/redirects/${id}`),

  /* search console (US-14.4) — every one of these answers honestly when the
   * feature is unconfigured (`status.configured === false`), so the callers
   * hide their UI instead of showing an empty table that reads as "zero". */
  searchConsoleStatus: () => http.get<{ status: SearchConsoleStatusDto }>('/api/admin/seo/search-console'),
  /** Returns the Google consent URL for the panel to open in a new tab —
   *  a full-page navigation here would discard an in-progress article. */
  connectSearchConsole: () => http.post<{ authUrl: string }>('/api/admin/seo/search-console/connect', {}),
  disconnectSearchConsole: () => http.del<{ ok: true }>('/api/admin/seo/search-console'),
  searchConsoleMetrics: (path: string) =>
    http.get<{ status: SearchConsolePanelStatusDto; metrics: SearchConsoleMetricsDto | null }>(
      `/api/admin/seo/search-console/metrics?path=${encodeURIComponent(path)}`,
    ),
  refreshSearchConsoleMetrics: (path: string) =>
    http.post<{ metrics: SearchConsoleMetricsDto }>('/api/admin/seo/search-console/metrics', { path }),

  /* catalog */
  /* catalog — see components/admin/catalog. `iconId`/`imageUrl` and the
     counts were all missing from these types, which is part of why the panel
     could never edit them. */
  categories: () =>
    http.get<{ categories: AdminCategory[] }>('/api/admin/catalog/categories'),
  createCategory: (input: { slug: string; name: string; order?: number; iconId?: string; imageUrl?: string | null }) =>
    http.post<{ category: AdminCategory }>('/api/admin/catalog/categories', input),
  updateCategory: (
    id: string,
    patch: Partial<{ slug: string; name: string; order: number; iconId: string; imageUrl: string | null; isActive: boolean }>,
  ) => http.patch<{ category: AdminCategory }>(`/api/admin/catalog/categories/${id}`, patch),
  deactivateCategory: (id: string) => http.del<{ ok: true }>(`/api/admin/catalog/categories/${id}`),

  subCategories: (categoryId?: string) =>
    http.get<{ subCategories: AdminSubCategory[] }>(
      `/api/admin/catalog/subcategories${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`,
    ),
  createSubCategory: (input: {
    categoryId: string;
    slug: string;
    name: string;
    groupLabel?: string | null;
    order?: number;
  }) => http.post<{ subCategory: AdminSubCategory }>('/api/admin/catalog/subcategories', input),
  /** `categoryId` moves the sub to another category — the server re-parents
   *  its products in the same call so the two can't drift apart. */
  updateSubCategory: (
    id: string,
    patch: Partial<{
      slug: string;
      name: string;
      groupLabel: string | null;
      order: number;
      categoryId: string;
      isActive: boolean;
    }>,
  ) => http.patch<{ subCategory: AdminSubCategory }>(`/api/admin/catalog/subcategories/${id}`, patch),
  deactivateSubCategory: (id: string) => http.del<{ ok: true }>(`/api/admin/catalog/subcategories/${id}`),

  skus: (params: {
    categoryId?: string;
    subCategoryId?: string;
    q?: string;
    status?: 'active' | 'inactive';
    /** 'hidden' → only products the public site cannot reach because a parent
     *  taxonomy node is deactivated. */
    visibility?: 'hidden';
    all?: boolean;
    page?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    if (params.subCategoryId) qs.set('subCategoryId', params.subCategoryId);
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.visibility) qs.set('visibility', params.visibility);
    if (params.all) qs.set('all', 'true');
    if (params.page) qs.set('page', String(params.page));
    return http.get<{
      rows: Array<{
        sku: AdminSku;
        price: { price: number; updatedAt: string } | null;
        /** All three levels active — what actually decides whether a customer
         *  can reach this product. `sku.isActive` alone never did. */
        visibleOnSite: boolean;
        hiddenReason: 'sub' | 'category' | null;
        subName: string;
      }>;
      total: number;
      /** Catalog-wide count of active products stranded on a deactivated
       *  sub-category/category — independent of the filters above. */
      hiddenTotal: number;
      page: number;
      perPage: number;
    }>(`/api/admin/catalog/skus?${qs}`);
  },
  createSku: (input: AdminSkuInput) => http.post<{ sku: AdminSku }>('/api/admin/catalog/skus', input),
  updateSku: (id: string, patch: Partial<AdminSkuInput> & { isActive?: boolean }) =>
    http.patch<{ sku: AdminSku }>(`/api/admin/catalog/skus/${id}`, patch),
  deactivateSku: (id: string) => http.del<{ ok: true }>(`/api/admin/catalog/skus/${id}`),
  /** What retiring this product would disturb — drives the confirm dialog. */
  skuImpact: (id: string) =>
    http.get<{ openLeads: number; openOrders: number; activeAlerts: number; favorites: number; hasPrice: boolean }>(
      `/api/admin/catalog/skus/${id}/impact`,
    ),
  /** Factory names already in use, for the form's datalist. */
  catalogFactories: () => http.get<{ factories: string[] }>('/api/admin/catalog/factories'),
  /** Every value already in use for the free-text SKU columns, so the product
   *  form can offer choices instead of asking the admin to type. */
  catalogSuggestions: (categoryId?: string) =>
    http.get<{ factories: string[]; sizes: string[]; grades: string[]; standards: string[]; groupLabels: string[] }>(
      `/api/admin/catalog/suggestions${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`,
    ),
  /** Shared image upload (article cover, SKU photo) — content:write or catalog:write. */
  uploadImage: (file: File) => http.upload<{ url: string }>('/api/admin/upload', file),

  /* price alerts (قیمت‌سنج) — admin management */
  alerts: (params: { status?: 'active' | 'triggered' | 'paused'; q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    return http.get<{ alerts: AdminAlertRow[]; total: number; caps: AlertTierCaps }>(`/api/admin/alerts?${qs}`);
  },
  /** Allows re-arming from ANY prior status, including 'triggered' (W22 —
   *  the API never actually restricted this; only the missing button did). */
  updateAlertStatus: (id: string, status: 'active' | 'paused') =>
    http.patch<{ alert: unknown }>(`/api/admin/alerts/${id}`, { status }),

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
  /** Direct staff invite (US-21.4) — 'admin' isn't a valid role here; that's
   *  allowlist-only (server rejects it). */
  createStaffUser: (input: { mobile: string; name?: string; role: 'operator' | 'sales' | 'content' | 'catalog' }) =>
    http.post<{ user: AdminUserRow }>('/api/admin/users', input),
  /** Profile + a recent-activity glance (leads/orders/AI usage), US-21.3. */
  userDetail: (id: string) =>
    http.get<{
      user: AdminUserRow;
      leads: Array<{ id: string; ref: string; status: string; createdAt: string }>;
      leadsHasMore: boolean;
      orders: Array<{ id: string; ref: string; status: string; placedAt: string }>;
      ordersHasMore: boolean;
      aiUsage: { conversationCount: number; promptTokens: number; completionTokens: number; cacheHitTokens: number };
    }>(`/api/admin/users/${id}`),
  revokeUserSessions: (id: string) => http.post<{ ok: true }>(`/api/admin/users/${id}/revoke-sessions`, {}),

  /* command palette — cross-entity jump (W26) */
  /** Rows are scoped PER ENTITY TYPE server-side (see lib/auth/adminSearch.ts):
   *  a kind the caller can't see is simply absent, never an empty group. The
   *  `signal` comes from react-query's queryFn context, so closing the palette
   *  aborts the in-flight request instead of resolving into a closed UI. */
  search: (q: string, signal?: AbortSignal) =>
    http.get<{ results: AdminSearchHit[] }>(`/api/admin/search?q=${encodeURIComponent(q)}`, {
      signal,
      // A per-keystroke lookup that the next keystroke replaces — one attempt,
      // no backoff retries piling up behind a fast typist.
      retries: 0,
    }),
  statsDashboard: (range: number) => http.get<DashboardStatsRes>(`/api/admin/stats/dashboard?range=${range}`),
  /** `range` windows every number on the page at once (7/30/90); the server
   *  allowlists it and falls back to 30. */
  statsMarketing: (range = 30) => http.get<MarketingStatsRes>(`/api/admin/stats/marketing?range=${range}`),
  statsSeo: () => http.get<SeoStatsRes>('/api/admin/stats/seo'),
  statsCohorts: () =>
    http.get<{ columns: string[]; rows: Array<{ label: string; size: number; cells: (number | null)[] }> }>(
      '/api/admin/stats/cohorts',
    ),
  /** `total` counts review ITEMS, not users — a user with both a personal and
   *  a business submission pending is two of them. */
  verifications: (page = 1) =>
    http.get<{ pending: PendingVerificationRow[]; total: number; page: number; perPage: number }>(
      `/api/admin/verifications?page=${page}`,
    ),
  reviewVerification: (userId: string, kind: 'id' | 'biz', decision: 'approved' | 'rejected') =>
    http.patch<{ ok: true; verificationLevel: number }>(`/api/admin/verifications/${userId}`, { kind, decision }),
  allowlist: () =>
    http.get<{ entries: AllowlistEntryRow[] }>('/api/admin/allowlist'),
  /** Grant panel access with a role — or change an existing entry's role
   *  (upsert keyed on the mobile). */
  addToAllowlist: (mobile: string, role: string, label?: string) =>
    http.post<{ entries: AllowlistEntryRow[] }>('/api/admin/allowlist', { mobile, role, label }),
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
  audit: (params: { entityType?: string; action?: string; actor?: string; from?: string; to?: string; cursor?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.entityType) qs.set('entityType', params.entityType);
    if (params.action) qs.set('action', params.action);
    if (params.actor) qs.set('actor', params.actor);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.cursor) qs.set('cursor', params.cursor);
    return http.get<{
      entries: Array<{
        id: string;
        actorId: string | null;
        actorName: string | null;
        actorMobile: string | null;
        action: string;
        entityType: string;
        entityId: string;
        before: unknown;
        after: unknown;
        at: string;
      }>;
      nextCursor: string | null;
    }>(`/api/admin/audit?${qs}`);
  },
  /** Same query params as `audit()`; browser navigates straight to it. */
  auditExportUrl: (params: { entityType?: string; action?: string; actor?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.entityType) qs.set('entityType', params.entityType);
    if (params.action) qs.set('action', params.action);
    if (params.actor) qs.set('actor', params.actor);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    return `/api/admin/audit/export?${qs}`;
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
  aiCorrections: (page = 1) =>
    http.get<{
      corrections: Array<{
        id: string;
        question: string;
        answer: string;
        sourceMessageId: string | null;
        isActive: boolean;
        createdAt: string;
      }>;
      total: number;
      page: number;
      perPage: number;
    }>(`/api/admin/ai/corrections?page=${page}`),
  createCorrection: (input: { question: string; answer: string; sourceMessageId?: string }) =>
    http.post<{ correction: unknown }>('/api/admin/ai/corrections', input),
  setCorrectionActive: (id: string, isActive: boolean) =>
    http.patch<{ ok: true }>(`/api/admin/ai/corrections/${id}`, { isActive }),
  aiUsage: (days = 14) =>
    http.get<{
      series: Array<{ date: string; promptTokens: number; completionTokens: number; cacheHitTokens: number; violations: number }>;
    }>(`/api/admin/ai/usage?days=${days}`),
  /** Eval-candidate queue (US-05.4) — a review queue for manually authoring
   *  a real evals.test.ts scenario, not an auto-write into the test file. */
  evalCandidates: (status?: 'pending' | 'promoted' | 'dismissed', page = 1) =>
    http.get<{
      candidates: Array<{
        id: string;
        conversationId: string | null;
        messageId: string | null;
        question: string;
        badAnswer: string;
        note: string | null;
        status: 'pending' | 'promoted' | 'dismissed';
        createdAt: string;
      }>;
      total: number;
      page: number;
      perPage: number;
    }>(`/api/admin/ai/eval-candidates?page=${page}${status ? `&status=${status}` : ''}`),
  createEvalCandidate: (input: { conversationId?: string; messageId?: string; question: string; badAnswer: string; note?: string }) =>
    http.post<{ candidate: unknown }>('/api/admin/ai/eval-candidates', input),
  setEvalCandidateStatus: (id: string, status: 'pending' | 'promoted' | 'dismissed') =>
    http.patch<{ candidate: unknown }>(`/api/admin/ai/eval-candidates/${id}`, { status }),
  /** System-prompt A/B (US-05.5). Versions themselves live in the generic
   *  settings key AI_PROMPT_VERSIONS (settings()/saveSetting() above). */
  promptVersionMetrics: () =>
    http.get<{
      metrics: Array<{
        versionId: string;
        conversationCount: number;
        promptTokens: number;
        completionTokens: number;
        cacheHitTokens: number;
        feedbackUp: number;
        feedbackDown: number;
      }>;
    }>('/api/admin/ai/prompt-versions/metrics'),
};
