/**
 * Mock fixtures — realistic seed data so screens are clickable before the backend.
 * (data-model.md §11.) Expanded per category as we build each section.
 */
import type { Category, MarketValue, PriceRow } from '@/lib/types/domain';

export const categories: Category[] = [
  { id: 'c1', slug: 'میلگرد', name: 'میلگرد', order: 1, iconId: 'cat-rebar', isActive: true },
  { id: 'c2', slug: 'تیراهن', name: 'تیرآهن', order: 2, iconId: 'cat-ibeam', isActive: true },
  { id: 'c3', slug: 'پروفیل', name: 'پروفیل', order: 3, iconId: 'cat-profile', isActive: true },
  { id: 'c4', slug: 'ورق-گرم', name: 'ورق گرم', order: 4, iconId: 'cat-hot-sheet', isActive: true },
  { id: 'c5', slug: 'ورق-سرد', name: 'ورق سرد', order: 5, iconId: 'cat-cold-sheet', isActive: true },
  { id: 'c6', slug: 'نبشی-ناودانی', name: 'نبشی و ناودانی', order: 6, iconId: 'cat-angle-channel', isActive: true },
  { id: 'c7', slug: 'لوله', name: 'لوله', order: 7, iconId: 'cat-pipe', isActive: true },
];

export const marketValues: MarketValue[] = [
  { key: 'usd', label: 'دلار', value: 82350, unit: 'تومان', source: 'tgju', movementDir: 'up', movementPct: 0.4, updatedAt: new Date().toISOString(), isStale: false },
  { key: 'eur', label: 'یورو', value: 89100, unit: 'تومان', source: 'tgju', movementDir: 'up', movementPct: 0.3, updatedAt: new Date().toISOString(), isStale: false },
  { key: 'gold18', label: 'طلای ۱۸', value: 3850000, unit: 'تومان', source: 'tgju', movementDir: 'down', movementPct: -0.2, updatedAt: new Date().toISOString(), isStale: false },
  { key: 'ounce', label: 'انس جهانی', value: 2380, unit: 'دلار', source: 'tgju', movementDir: 'up', movementPct: 0.1, updatedAt: new Date().toISOString(), isStale: false },
  { key: 'billet', label: 'شمش فولاد', value: 285000, unit: 'تومان', source: 'admin', movementDir: 'up', movementPct: 0.6, updatedAt: new Date().toISOString(), isStale: false },
];

/** Sample میلگرد آجدار rows (the Datasheet). */
export const rebarRows: PriceRow[] = [
  {
    id: 's1', subCategoryId: 'sc1', categoryId: 'c1', slug: 'میلگرد-14-a3-ذوب-اهن',
    name: 'میلگرد ۱۴ A3 ذوب‌آهن', standard: 'A3', size: '14', grade: 'A3', factory: 'ذوب‌آهن',
    theoreticalWeightKg: 18.9, unit: 'kg', isActive: true,
    current: { skuId: 's1', price: 32450, unit: 'kg', deliveryTime: '۲۴ ساعت', vatIncluded: false, movementPct: 0.8, movementDir: 'up', updatedAt: new Date().toISOString(), isStale: false },
  },
  {
    id: 's2', subCategoryId: 'sc1', categoryId: 'c1', slug: 'میلگرد-16-a3-ذوب-اهن',
    name: 'میلگرد ۱۶ A3 ذوب‌آهن', standard: 'A3', size: '16', grade: 'A3', factory: 'ذوب‌آهن',
    theoreticalWeightKg: 24.7, unit: 'kg', isActive: true,
    current: { skuId: 's2', price: 32100, unit: 'kg', deliveryTime: '۴۸ ساعت', vatIncluded: false, movementPct: -0.3, movementDir: 'down', updatedAt: new Date().toISOString(), isStale: false },
  },
];
