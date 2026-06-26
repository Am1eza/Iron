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

export type LeadSource = 'table' | 'ai' | 'cart' | 'cooperation' | 'tool';
export type LeadStatus = 'new' | 'contacted' | 'won' | 'lost';

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
