/**
 * Domain types — mirrors product/data-model.md.
 * Money is integer Toman. Dates are ISO-8601 strings (Jalali only at display).
 */

import type { RichDoc } from '@/lib/content/richDoc';

/**
 * کیلوگرم / شاخه / برگ / متر / عدد / متر مربع — WHAT `qty` COUNTS IN.
 *
 * The single source, deliberately in this browser-safe module rather than in
 * `server/db/schema/catalog.ts`: the Drizzle column, every Zod request schema
 * and the client's `PriceUnit` type all need this list, and the schema module
 * cannot be imported from a client bundle (it pulls in `pg`). `PRICE_UNITS`
 * there now re-exports this array, so the two can no longer drift — they were
 * two hand-maintained copies of the same union until `piece` was added.
 *
 * This says NOTHING about what the price is per — that is `PriceBasis` below,
 * a separate column. The two used to be conflated in this one field, which is
 * how 55 rows (وال پست, لوله مسی, ورق پانچ) ended up captioned «۱۶٬۴۹۲٬۳۸۰
 * تومان / کیلوگرم» on a product whose price is per 15-metre coil.
 *
 * `sqm` («متر مربع») is ساندویچ‌پانل's unit: that product is quoted, ordered
 * and delivered by square metre, and — unlike every other member here — its
 * quantity is legitimately fractional (۱۲٫۵ متر مربع), so it is deliberately
 * NOT part of `WHOLE_PIECE_UNITS`.
 */
export const PRICE_UNIT_VALUES = ['kg', 'branch', 'sheet', 'meter', 'piece', 'sqm'] as const;
export type PriceUnit = (typeof PRICE_UNIT_VALUES)[number];

/**
 * WHAT A STORED PRICE IS DENOMINATED IN — independent of `PriceUnit` above.
 *
 * `current_prices.price` was per KILOGRAM for every unit except `piece`, an
 * invariant carried only in prose (`leads.service.priceItems`) and repeated at
 * five call sites. It was false for 74 live rows:
 *
 *   - 19 تیرآهن rows held a per-شاخه figure and, because تیرآهن is the one
 *     family that also carries a real `theoreticalWeightKg`, auto-quoted a
 *     branch at 155× the real price (fixed in the data, #201).
 *   - 55 more — وال پست (per قطعه), لوله مسی (per کلاف ۱۵ متری), ورق پانچ
 *     (per برگ) — could not be fixed that way: there is no published weight
 *     for a copper coil to divide by. They failed safe (null weight ⇒ no
 *     total ⇒ routed to a human) but were captioned «تومان / کیلوگرم».
 *
 * So the denomination is now a column, not an assumption. Members:
 *
 * | basis    | the price is per…              | length read from        |
 * |----------|--------------------------------|-------------------------|
 * | `kg`     | one kilogram (the default)     | —                       |
 * | `branch` | one whole شاخه                 | `SKU.branchLengthM`     |
 * | `coil`   | one whole کلاف / حلقه          | `SKU.branchLengthM`     |
 * | `sheet`  | one برگ                        | `SKU.dimensions`        |
 * | `piece`  | one عدد                        | —                       |
 * | `sqm`    | one متر مربع                   | —                       |
 *
 * `branch` and `coil` are two members rather than one because the caption has
 * to say which («شاخه ۶ متری» vs «کلاف ۱۵ متری») — the arithmetic is the same
 * and `PRICE_BASIS_COUNTING_UNIT` maps both onto the `branch` unit.
 *
 * The length lives on the SKU, not here: it is a property of the product, and
 * duplicating it per price row would be the second silent assumption this
 * column exists to remove.
 */
export const PRICE_BASIS_VALUES = ['kg', 'branch', 'coil', 'sheet', 'piece', 'sqm'] as const;
export type PriceBasis = (typeof PRICE_BASIS_VALUES)[number];

/**
 * For a whole-item basis, the `PriceUnit` a line must count in for
 * `qty × price` to mean anything. `null` for `kg` — that basis goes through
 * the mass path (`unitPrice × weightKg`) instead.
 *
 * This is what keeps «۲۰ کیلوگرم» of a per-coil product from being multiplied
 * by the coil price. A line whose unit does not match its basis's counting
 * unit gets NO total, which sets `allPriced=false` and routes the lead to a
 * human — the same fail-safe `unitMismatch` already uses.
 */
export const PRICE_BASIS_COUNTING_UNIT: Record<PriceBasis, PriceUnit | null> = {
  kg: null,
  branch: 'branch',
  // A کلاف is counted the same way a شاخه is — one whole length — so the unit
  // stays `branch`; `coil` exists to make the CAPTION honest, not the maths.
  coil: 'branch',
  sheet: 'sheet',
  piece: 'piece',
  sqm: 'sqm',
};
export type MovementDir = 'up' | 'down' | 'flat';
export type NotifyChannel = 'sms' | 'telegram' | 'whatsapp' | 'eitaa';
export type MarketKey = 'usd' | 'eur' | 'gold18' | 'ounce' | 'billet';

/** A customer's price alert (قیمت‌سنج) — mirrors AlertDto server-side. */
export interface Alert {
  id: string;
  target: { type: 'sku'; skuId: string; label?: string } | { type: 'market'; key: MarketKey; label?: string };
  op: 'below' | 'above';
  threshold: number;
  channel: NotifyChannel;
  status: 'active' | 'triggered' | 'paused';
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Live current SKU price / market value + staleness (W22) — lets the
   *  customer's own alert list show "how close is this to firing." */
  currentValue?: number | null;
  isStale?: boolean;
}

export interface SeoMeta {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  /** The phrase this article is written to rank for (US-14.4) — supplied by
   *  the writer, never inferred. Everything downstream (the on-page SEO
   *  checklist, the keywordchi/Trends deep-link buttons) keys off this exact
   *  string; it is deliberately part of the existing `seo` jsonb blob rather
   *  than a new column, since it is schema-free metadata of the same shape
   *  as `title`/`description` above, not something any index or repo query
   *  needs to reach into. */
  focusKeyword?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  order: number;
  iconId: string;
  imageUrl?: string;
  isActive: boolean;
  /**
   * One or two lines saying what this product line IS and who buys it —
   * admin-authored, read from `categories.seo.description`.
   *
   * Flattened out of the `seo` blob rather than carried as a whole `SeoMeta`
   * because that is the only field of it the public surfaces use, and a
   * component that only needs the sentence should not be handed a canonical
   * URL and an OG image alongside it. It is stored in `seo` (and not in a new
   * column) for the same reason `focusKeyword` is: it is schema-free page
   * metadata of exactly that shape, and nothing indexes or queries into it.
   *
   * Optional everywhere: a category with no description renders none, in the
   * menu and in the JSON-LD alike. There is no fallback sentence, because a
   * generated one would be the keyword-stuffed boilerplate this field exists
   * to replace.
   */
  description?: string;
}

export interface SubCategory {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  /** Display-only cluster label, not a real hierarchy level — see server/db/schema/catalog.ts. */
  groupLabel: string | null;
  order: number;
  isActive: boolean;
}

export interface SKU {
  id: string;
  subCategoryId: string;
  categoryId: string;
  slug: string;
  name: string;
  standard?: string;
  size?: string;
  grade?: string;
  /** ورق only — the plate's width×length, e.g. «۱۰۰۰×۲۰۰۰». For a sheet,
   *  `size` is the THICKNESS; this is the other two dimensions. Undefined for
   *  every other category and for sheets nobody has filled it in for yet.
   *  See server/db/schema/catalog.ts. */
  dimensions?: string;
  factory?: string;
  /** Producing city — «اصفهان», «تهران», … — for the پروفیل sub-categories
   *  whose mill names are withheld (see `catalogLabels.factoryIsMeaningful`).
   *
   *  NOT a stored column and NOT sourced data: it is recovered from the city
   *  embedded in the fabricated factory string, because that is the only
   *  regional signal this catalog holds and it is the axis ahanonline
   *  structures its پروفیل pages by. Undefined wherever no city could be
   *  established, and everywhere `factory` is published — the two are
   *  alternatives, never both. See `catalogLabels.regionFromFactory`. */
  region?: string;
  theoreticalWeightKg?: number;
  unit: PriceUnit;
  /** What this SKU's price is denominated in — see `PriceBasis`. `kg` for
   *  every row that predates the column, which is what it always meant. */
  priceBasis: PriceBasis;
  /** Length of ONE شاخه / کلاف of this product, in metres.
   *
   *  Two jobs, one number: it is what a `branch`/`coil` basis is a length OF
   *  («تومان / کلاف ۱۵ متری»), and it is the branch length a theoretical
   *  weight is computed over. Both 6 m and 12 m نبشی/ناودانی are genuinely
   *  sold, so this had to become per-SKU data rather than the 6 m constant
   *  `CATALOG_WEIGHT_BASIS` assumed for the whole line.
   *
   *  Undefined means "not recorded" — captions drop the length and weight
   *  composition falls back to the sub-category's documented convention. */
  branchLengthM?: number;
  /** Per-product photo (W24). Until now `skus.image_url` was written by the
   *  admin form and read by nothing — the public page fell back to a stock
   *  photo keyed on CATEGORY, so every rebar looked identical and an uploaded
   *  photo silently went nowhere. */
  imageUrl?: string;
  isActive: boolean;
  /** Category IDs this SKU is ALSO listed under, beyond its own home
   *  (categoryId/subCategoryId, which is what its URL is built from) — e.g.
   *  a sheet-steel product tagged into the "استیل" hub category too. Never
   *  a second row, never a second URL. See server/db/schema/catalog.ts. */
  crossListedCategoryIds?: string[];
}

export interface CurrentPrice {
  skuId: string;
  price: number; // Toman, excl. VAT
  unit: PriceUnit;
  /** What THIS price is per — see `PriceBasis`. Stored on the price row as
   *  well as the SKU so a historical `price_points` entry stays readable
   *  after the SKU's denomination is corrected. */
  priceBasis: PriceBasis;
  deliveryTime: string; // زمان تحویل, e.g. «۲۴ ساعت»
  vatIncluded: boolean;
  movementPct?: number;
  movementDir: MovementDir;
  updatedAt: string;
  isStale: boolean;
  /** Older than PRICE_STALE_HIDE_AFTER — UI shows «تماس بگیرید» instead of the price. */
  priceHidden?: boolean;
}

export interface PricePoint {
  id: string;
  skuId: string;
  price: number;
  unit: PriceUnit;
  priceBasis: PriceBasis;
  at: string;
}

/** A price table row = SKU joined with its current price. */
export interface PriceRow extends SKU {
  current: CurrentPrice;
}

export interface MarketValue {
  key: MarketKey;
  label: string;
  value: number;
  unit: string;
  source: 'tgju' | 'admin';
  movementDir: MovementDir;
  movementPct?: number;
  updatedAt: string;
  isStale: boolean;
}

export type LeadSource = 'table' | 'ai' | 'cart' | 'cooperation' | 'tool' | 'warehouse';
export type LeadStatus = 'new' | 'contacted' | 'won' | 'lost';

/* ---------- Customer warehouse «انبار مشتریان» (request #7) ---------- */

/** Lifecycle of a consigned stock item we store on the customer's behalf. */
export type WarehouseStatus = 'pending' | 'stored' | 'selling' | 'released';

export const WAREHOUSE_STATUS_LABEL: Record<WarehouseStatus, string> = {
  pending: 'در انتظار تحویل',
  stored: 'انبارشده',
  selling: 'در حال فروش',
  // W20 audit: this used to be «تسویه‌شده» — one letter and one tab away from
  // «تسویه‌حساب» (the billing tab), so an operator who'd just recorded a
  // settlement could easily pick this and irreversibly mark still-physical
  // stock as gone. `released` is about CUSTODY (left the warehouse), never
  // about billing — the label now says exactly that.
  released: 'خارج‌شده از انبار',
};

export interface WarehouseItem {
  id: string;
  ref: string;
  product: string;
  sizeLabel?: string;
  quantityTons: number;
  monthlyFeeToman: number;
  storedAt: string; // ISO — row-creation timestamp, kept for backward compat
  arrivedAt?: string; // ISO — actual physical intake date (W20)
  releasedAt?: string; // ISO — stop-clock, stamped when status → released (W20)
  location?: string;
  contractRef?: string;
  insured: boolean;
  status: WarehouseStatus;
  /** What this item currently owes, computed live — lets «انبار من» show a
   *  real balance instead of nothing (W20). */
  unsettledToman?: number;
}

/* ---------- Order / cargo tracking (request #11) ---------- */

/** Ordered shipment timeline — from registration to delivery. */
export type ShipmentStatus =
  | 'registered'
  | 'confirmed'
  | 'loading'
  | 'in_transit'
  | 'delivered';

/** Ordered steps so a stepper/timeline can render the full path. */
export const SHIPMENT_STEPS: { key: ShipmentStatus; label: string }[] = [
  { key: 'registered', label: 'ثبت‌شده' },
  { key: 'confirmed', label: 'تأییدشده' },
  { key: 'loading', label: 'بارگیری' },
  { key: 'in_transit', label: 'در حال حمل' },
  { key: 'delivered', label: 'تحویل' },
];

export interface Order {
  ref: string;
  placedAt: string; // ISO
  items: LineItem[];
  status: ShipmentStatus;
  lastUpdate: string; // ISO
  trackingNumber?: string;
  carrierName?: string;
  /** Cancelled/archived (US-08.4's soft-delete), independent of `status` — a
   *  cancelled order KEEPS whatever status it last had (how far it got
   *  before cancellation), so this flag, not the status stepper, is what
   *  tells a customer or rep "this one is dead." */
  cancelled?: boolean;
}

export interface LineItem {
  skuId: string;
  name: string;
  qty: number;
  unit: PriceUnit;
  weightKg?: number;
  unitPrice?: number;
  lineTotal?: number;
}

export interface Lead {
  id: string;
  ref: string;
  contact: { name?: string; mobile: string; verified: boolean };
  source: LeadSource;
  items: LineItem[];
  channelPref: NotifyChannel;
  status: LeadStatus;
  createdAt: string;
}

export interface Article {
  id: string;
  slug: string;
  type: 'blog' | 'news';
  title: string;
  excerpt?: string;
  /**
   * DERIVED markdown mirror of `bodyJson` — present on live article-detail
   * reads. Still the column full-text search, the AI advisor's guide grounding
   * and the SEO word count run against; no longer what an editor types.
   */
  bodyMd?: string;
  /** Structured body (US-12.4) — the source of truth for rendering. `null` on
   *  a row written before the structured editor shipped, which falls back to
   *  parsing `bodyMd`. See `components/content/ArticleBody`. */
  bodyJson?: RichDoc | null;
  /** Cover/hero image — used for the list thumbnail, OG image and Article JSON-LD. */
  coverUrl?: string;
  status: 'draft' | 'scheduled' | 'published';
  source: 'ai' | 'human';
  publishAt?: string;
  /** Last edit — feeds Article JSON-LD `dateModified` and the RSS feeds.
   *  Optional: the mock catalog has no such field, and articleJsonLd falls
   *  back to `datePublished` when it's absent. */
  updatedAt?: string;
  /** Editorial labels. Always an array on live reads — `toArticleDto`
   *  normalises the column's `null` (untagged) to `[]`, so no consumer has to
   *  branch on the difference. Optional only because the mock catalog omits it. */
  tags?: string[];
  /** Catalog category ids this article is filed under (US-14.5) — same
   *  normalisation story as `tags` above: `null` and `[]` both mean
   *  uncategorised, and `toArticleDto` collapses both to `[]`. */
  relatedCategoryIds?: string[];
  /** Market-news topic slugs (اخبار بازار), news-only in practice — see
   *  `lib/data/newsTopics.ts`. Same null/[] normalisation as `tags` above. */
  relatedNewsTopicIds?: string[];
  /** Admin-editable FAQ (US-14.7). `undefined`/`[]` both mean "no FAQ
   *  section" — `toArticleDto` normalises the column's `null` to `[]`. */
  faq?: { question: string; answer: string }[];
  seo?: SeoMeta;
}
