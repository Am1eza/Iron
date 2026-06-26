# Poladin — Data Model
## Layer 2 · Product Design — Document 11 (completes the IA's content model)

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `information-architecture.md §1.4`, `product-scope.md §8`, `acceptance-criteria.md`.
**Purpose:** Turn the IA content model into a concrete, typed schema — entities, fields, enums, relationships, constraints, and a light API contract — so the **frontend can build against typed models and mocks** and the backend has a clear target. (Persisted layer is backend-agnostic; types are TypeScript for the frontend.)

### Conventions
- IDs are opaque strings (`ulid`/`uuid`). Money in **Toman, integer** (no decimals). Dates are **ISO-8601 UTC** in storage; **Jalali** only at display. Timestamps: `createdAt`, `updatedAt`.
- Persian display strings live in data; slugs are stable (IA §3.2).
- `?` = optional/nullable.

---

## 1. Entity Map (relationships)
```
Category 1─* SubCategory 1─* SKU 1─1 CurrentPrice
                                  SKU 1─* PricePoint (history)
SKU *─* User (Favorite)     SKU *─* Alert     InquiryCart 1─* CartItem (→SKU)
Lead 1─* LineItem (→SKU)    Lead 1─0..1 Proforma     Lead 0..1← (AI Conversation, Cart, Cooperation)
User 1─* Lead   User 1─* Alert   User 1─* Favorite   User 1─0..1 ClubMembership
MarketValue 1─* MarketPoint (history)        Article *─* (SKU|Category) related
PartnerLogo / CustomerLogo            AdminUser *─ Role            AuditEntry (polymorphic)
Setting (kv)
```

---

## 2. Catalog

```ts
interface Category {
  id: string;
  slug: string;             // stable, Persian (IA): "میلگرد"
  name: string;             // "میلگرد"
  order: number;
  iconId: string;           // cat-rebar
  imageUrl?: string;        // rail hero image
  isActive: boolean;
  seo?: SeoMeta;
  createdAt: string; updatedAt: string;
}

interface SubCategory {
  id: string; categoryId: string;
  slug: string;             // "اجدار"
  name: string;             // "میلگرد آجدار"
  order: number;
  isActive: boolean;
  seo?: SeoMeta;
}

interface SKU {
  id: string; subCategoryId: string; categoryId: string;
  slug: string;             // "میلگرد-14-a3-ذوب-اهن"
  name: string;             // display
  standard?: string;        // "A3" | "st37" | "IPE140" ...
  size?: string;            // "14"
  grade?: string;           // "A3"
  factory?: string;         // "ذوب‌آهن"
  theoreticalWeightKg?: number;  // per unit (شاخه/برگ/متر) — for وزن‌سنج & per-kg↔per-piece
  unit: PriceUnit;          // base selling unit
  isActive: boolean;        // inactive = hidden, history kept
  seo?: SeoMeta;
  createdAt: string; updatedAt: string;
}

type PriceUnit = "kg" | "branch" | "sheet" | "meter"; // کیلوگرم/شاخه/برگ/متر
```

## 3. Pricing (manual, admin-entered)

```ts
interface CurrentPrice {       // 1:1 with SKU (denormalized for fast tables)
  skuId: string;
  price: number;               // Toman, the entered price (excl. VAT)
  unit: PriceUnit;
  deliveryTime: string;        // "۲۴ ساعت" | "۴۸ ساعت" | freeform (زمان تحویل)
  vatIncluded: boolean;        // whether the entered figure already includes VAT (default false)
  movementPct?: number;        // نوسان % vs previous (auto-computed)
  movementDir: "up" | "down" | "flat";
  updatedAt: string;           // freshness stamp (the last-updated)
  updatedBy: string;           // admin user id (audit)
  isStale: boolean;            // computed: not updated within PRICE_FRESH_WINDOW
}

interface PricePoint {         // append-only history → charts + نوسان
  id: string; skuId: string;
  price: number; unit: PriceUnit;
  at: string;                  // timestamp
}
```
**Rules (acceptance-criteria):** on save → compute `movementPct = (new-prev)/prev*100`, set `movementDir`, append a `PricePoint`, stamp `updatedAt/By`, set `isStale=false`; nightly/compute `isStale` per `PRICE_FRESH_WINDOW`; beyond `PRICE_STALE_HIDE_AFTER` the UI shows «تماس بگیرید» (price hidden, not deleted). `VAT_RATE` from Settings.

## 4. Market Data (ticker «نبض بازار»)

```ts
interface MarketValue {
  key: MarketKey;              // usd | eur | gold18 | ounce | billet
  label: string;              // "دلار"
  value: number;              // Toman or USD (ounce)
  unit: string;               // "تومان" | "دلار"
  source: "tgju" | "admin";   // billet = admin; rest = tgju
  movementDir: "up" | "down" | "flat";
  movementPct?: number;
  updatedAt: string;
  isStale: boolean;           // tgju unreachable → last-known + flag
}
type MarketKey = "usd" | "eur" | "gold18" | "ounce" | "billet";

interface MarketPoint { id: string; key: MarketKey; value: number; at: string; }
```

## 5. Users & Engagement

```ts
interface User {              // public buyer; auth = mobile + OTP
  id: string;
  mobile: string;             // normalized 09XXXXXXXXX
  name?: string;
  createdAt: string; lastSeenAt?: string;
  // relations: favorites, alerts, leads, club
}

interface Favorite { id: string; userId: string; skuId: string; createdAt: string; }

interface Alert {
  id: string; userId: string;
  target: { type: "sku"; skuId: string } | { type: "market"; key: MarketKey };
  op: "below" | "above";      // زیر / بالای
  threshold: number;          // Toman
  channel: NotifyChannel;     // sms | telegram | whatsapp | eitaa
  status: "active" | "triggered" | "paused";
  lastTriggeredAt?: string;
  createdAt: string;
}
type NotifyChannel = "sms" | "telegram" | "whatsapp" | "eitaa";

interface ClubMembership {
  id: string; userId: string;
  tier: "iron" | "steel" | "poolad";   // آهن → فولاد → پولاد
  joinedAt: string;
  // benefits resolved from Settings/tier config
}
```

## 6. Cart, Lead & Proforma (the conversion spine)

```ts
interface InquiryCart { id: string; userId?: string; sessionId: string; items: CartItem[]; updatedAt: string; }
interface CartItem { skuId: string; qty: number; unit: PriceUnit; }

interface Lead {
  id: string;
  ref: string;                // human ref, e.g. PF-14050405-0021
  userId?: string;
  contact: { name?: string; mobile: string; verified: boolean };  // OTP verified
  source: LeadSource;         // table | ai | cart | cooperation | tool
  cooperationType?: "market-analysis" | "supply" | "sell";        // تحلیل بازار/تأمین/فروش
  items: LineItem[];
  context?: {                 // warm-lead context for sales
    aiConversationId?: string;
    sourcePage?: string;
    estimate?: { totalWeightKg?: number; totalPrice?: number };
  };
  channelPref: NotifyChannel;
  status: LeadStatus;         // new → contacted → won | lost
  assigneeId?: string;        // admin sales user
  notes?: LeadNote[];
  callbackAt?: string;
  createdAt: string; updatedAt: string;
}
type LeadSource = "table" | "ai" | "cart" | "cooperation" | "tool";
type LeadStatus = "new" | "contacted" | "won" | "lost";
interface LineItem { skuId: string; name: string; qty: number; unit: PriceUnit; weightKg?: number; unitPrice?: number; lineTotal?: number; }
interface LeadNote { id: string; authorId: string; text: string; at: string; }

interface Proforma {          // پیش‌فاکتور (generated from a Lead)
  id: string; leadId: string; ref: string;
  lines: LineItem[];
  subtotal: number; vatRate: number; vatAmount: number; total: number;  // Toman
  validUntil: string;         // QUOTE_VALIDITY
  status: "active" | "expired";
  pdfUrl?: string;
  createdAt: string;
}
```

## 7. Content & Brand Assets

```ts
interface Article {
  id: string; slug: string; type: "blog" | "news";
  title: string; excerpt?: string; bodyMd: string; coverUrl?: string;
  status: "draft" | "scheduled" | "published";   // AI draft → editor approval gate
  source: "ai" | "human";
  authorId?: string; approvedBy?: string;
  publishAt?: string; relatedSkuIds?: string[]; relatedCategoryIds?: string[];
  seo?: SeoMeta;
  createdAt: string; updatedAt: string;
}

interface BrandLogo { id: string; kind: "partner" | "customer"; name: string; logoUrl: string; order: number; isActive: boolean; }

interface SeoMeta { title?: string; description?: string; canonical?: string; ogImage?: string; }
```

## 8. Admin & System

```ts
interface AdminUser { id: string; mobile: string; name: string; roles: Role[]; isActive: boolean; }
type Role = "super-admin" | "price-operator" | "sales" | "content-editor" | "catalog-manager";

interface AuditEntry {
  id: string; actorId: string; action: string;     // "price.update" | "lead.status" | "content.publish" ...
  entity: { type: string; id: string };
  before?: unknown; after?: unknown; at: string;
}

interface Setting { key: string; value: unknown; updatedAt: string; }
// keyed constants (acceptance-criteria §1.4): VAT_RATE, QUOTE_VALIDITY, PRICE_FRESH_WINDOW,
// PRICE_STALE_HIDE_AFTER, OTP_*, TICKER_REFRESH, club tiers/benefits, channel configs.
```

---

## 9. Key Constraints & Indexes
- **Unique:** `Category.slug`, `SubCategory(categoryId,slug)`, `SKU.slug`, `User.mobile`, `Lead.ref`, `Proforma.ref`.
- **Indexes (read-hot):** `CurrentPrice(skuId)`, `SKU(subCategoryId,isActive)`, `PricePoint(skuId,at)`, `Alert(status)`, `Lead(status,assigneeId,createdAt)`, `Article(status,publishAt)`, `MarketValue(key)`.
- **Soft-delete:** `isActive=false` hides SKUs/categories but **retains history** (never hard-delete priced SKUs).
- **Money:** integer Toman everywhere; never float.

## 10. API Contract (outline — REST; backend layer details later)
Public (read-mostly):
- `GET /api/categories` · `GET /api/categories/{slug}` · `GET /api/categories/{slug}/{sub}` (table) · `GET /api/sku/{slug}` (+`/history?range=`)
- `GET /api/market` (ticker) · `GET /api/market/{key}/history`
- `POST /api/ai/chat` (server-side → DeepSeek relay; tools: getPrice/calcWeight/estimateProject/createLead)
- `POST /api/tools/weight` · `POST /api/tools/estimate`
- `POST /api/auth/otp/request` · `POST /api/auth/otp/verify`
- `POST /api/leads` (request → proforma + SMS + CRM) · `GET /api/me/leads` · `GET /api/proforma/{ref}`
- `POST /api/alerts` · `GET/DELETE /api/me/alerts/{id}` · `POST /api/favorites` ...
- `POST /api/cooperation` · `GET /api/articles` · `GET /api/articles/{slug}`
Admin (role-gated, `noindex`):
- `GET/POST /api/admin/pricing` (bulk daily grid) · `/admin/catalog/*` · `/admin/market/billet`
- `/admin/leads/*` · `/admin/content/*` (approval) · `/admin/club/*` · `/admin/users/*` · `/admin/settings/*` · `/admin/audit`

## 11. Frontend Mock/Seed Strategy
- Ship **seed fixtures** for all 7 categories with a few SKUs each + `CurrentPrice` + a short `PricePoint` history → the frontend builds the **Datasheet table, chart, ticker, AI estimate** against realistic data before the backend exists.
- Provide a mock `/api` (MSW or local JSON) matching §10 so screens are fully clickable.
- Mock the AI tool responses (grounded) so the advisor flow is demoable.

## 12. Bridge
- Completes the IA's promised content model; gives Layer 4 **typed models, validation rules, and a mock contract**.
- Pairs with `acceptance-criteria.md` (rules/constants) and `information-architecture.md` (slugs/SEO).

*Poladin — اول مشورت، بعد خرید.*
