/**
 * Domain types — mirrors product/data-model.md.
 * Money is integer Toman. Dates are ISO-8601 strings (Jalali only at display).
 */

export type PriceUnit = 'kg' | 'branch' | 'sheet' | 'meter'; // کیلوگرم/شاخه/برگ/متر
export type MovementDir = 'up' | 'down' | 'flat';
export type NotifyChannel = 'sms' | 'telegram' | 'whatsapp' | 'eitaa';
export type MarketKey = 'usd' | 'eur' | 'gold18' | 'ounce' | 'billet';

export interface SeoMeta {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  order: number;
  iconId: string;
  imageUrl?: string;
  isActive: boolean;
}

export interface SubCategory {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
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
  factory?: string;
  theoreticalWeightKg?: number;
  unit: PriceUnit;
  isActive: boolean;
}

export interface CurrentPrice {
  skuId: string;
  price: number; // Toman, excl. VAT
  unit: PriceUnit;
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
  /** Markdown body — present on live article-detail reads. */
  bodyMd?: string;
  /** Cover/hero image — used for the list thumbnail, OG image and Article JSON-LD. */
  coverUrl?: string;
  status: 'draft' | 'scheduled' | 'published';
  source: 'ai' | 'human';
  publishAt?: string;
  seo?: SeoMeta;
}
