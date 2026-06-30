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
  released: 'تسویه‌شده',
};

export interface WarehouseItem {
  id: string;
  ref: string;
  product: string;
  sizeLabel?: string;
  quantityTons: number;
  monthlyFeeToman: number;
  storedAt: string; // ISO
  status: WarehouseStatus;
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
  status: 'draft' | 'scheduled' | 'published';
  source: 'ai' | 'human';
  publishAt?: string;
  seo?: SeoMeta;
}
