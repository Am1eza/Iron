/**
 * Mock fixtures — realistic seed data so screens are clickable before the backend.
 * (data-model.md §11.) Expanded per category as we build each section.
 */
import type { Category, MarketValue, PriceRow } from '@/lib/types/domain';

export const categories: Category[] = [
  { id: 'c1', slug: 'rebar', name: 'میلگرد', order: 1, iconId: 'cat-rebar', isActive: true },
  { id: 'c2', slug: 'ibeam', name: 'تیرآهن', order: 2, iconId: 'cat-ibeam', isActive: true },
  { id: 'c3', slug: 'profile', name: 'پروفیل', order: 3, iconId: 'cat-profile', isActive: true },
  { id: 'c4', slug: 'hot-sheet', name: 'ورق گرم', order: 4, iconId: 'cat-hot-sheet', isActive: true },
  { id: 'c5', slug: 'cold-sheet', name: 'ورق سرد', order: 5, iconId: 'cat-cold-sheet', isActive: true },
  { id: 'c6', slug: 'angle-channel', name: 'نبشی و ناودانی', order: 6, iconId: 'cat-angle-channel', isActive: true },
  { id: 'c7', slug: 'pipe', name: 'لوله', order: 7, iconId: 'cat-pipe', isActive: true },
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
    id: 's1', subCategoryId: 'sc1', categoryId: 'c1', slug: 'rebar-14-a3-zob',
    name: 'میلگرد ۱۴ A3 ذوب‌آهن', standard: 'A3', size: '14', grade: 'A3', factory: 'ذوب‌آهن',
    theoreticalWeightKg: 18.9, unit: 'kg', isActive: true,
    current: { skuId: 's1', price: 32450, unit: 'kg', deliveryTime: '۲۴ ساعت', vatIncluded: false, movementPct: 0.8, movementDir: 'up', updatedAt: new Date().toISOString(), isStale: false },
  },
  {
    id: 's2', subCategoryId: 'sc1', categoryId: 'c1', slug: 'rebar-16-a3-zob',
    name: 'میلگرد ۱۶ A3 ذوب‌آهن', standard: 'A3', size: '16', grade: 'A3', factory: 'ذوب‌آهن',
    theoreticalWeightKg: 24.7, unit: 'kg', isActive: true,
    current: { skuId: 's2', price: 32100, unit: 'kg', deliveryTime: '۴۸ ساعت', vatIncluded: false, movementPct: -0.3, movementDir: 'down', updatedAt: new Date().toISOString(), isStale: false },
  },
  {
    id: 's3', subCategoryId: 'sc1', categoryId: 'c1', slug: 'rebar-18-a3-zob',
    name: 'میلگرد ۱۸ A3 ذوب‌آهن', standard: 'A3', size: '18', grade: 'A3', factory: 'ذوب‌آهن',
    theoreticalWeightKg: 31.2, unit: 'kg', isActive: true,
    current: { skuId: 's3', price: 31950, unit: 'kg', deliveryTime: '۲۴ ساعت', vatIncluded: false, movementPct: 0.5, movementDir: 'up', updatedAt: new Date().toISOString(), isStale: false },
  },
  {
    id: 's4', subCategoryId: 'sc1', categoryId: 'c1', slug: 'rebar-20-a3-neyshabur',
    name: 'میلگرد ۲۰ A3 نیشابور', standard: 'A3', size: '20', grade: 'A3', factory: 'نیشابور',
    theoreticalWeightKg: 38.5, unit: 'kg', isActive: true,
    current: { skuId: 's4', price: 32600, unit: 'kg', deliveryTime: '۲۴ ساعت', vatIncluded: false, movementPct: 1.2, movementDir: 'up', updatedAt: new Date().toISOString(), isStale: false },
  },
  {
    id: 's5', subCategoryId: 'sc1', categoryId: 'c1', slug: 'rebar-22-a3-zob',
    name: 'میلگرد ۲۲ A3 ذوب‌آهن', standard: 'A3', size: '22', grade: 'A3', factory: 'ذوب‌آهن',
    theoreticalWeightKg: 46.5, unit: 'kg', isActive: true,
    current: { skuId: 's5', price: 31800, unit: 'kg', deliveryTime: '۷۲ ساعت', vatIncluded: false, movementPct: 0, movementDir: 'flat', updatedAt: new Date().toISOString(), isStale: false },
  },
  {
    id: 's6', subCategoryId: 'sc1', categoryId: 'c1', slug: 'rebar-25-a3-kaveh',
    name: 'میلگرد ۲۵ A3 کاوه', standard: 'A3', size: '25', grade: 'A3', factory: 'کاوه',
    theoreticalWeightKg: 60.1, unit: 'kg', isActive: true,
    current: { skuId: 's6', price: 33150, unit: 'kg', deliveryTime: '۲۴ ساعت', vatIncluded: false, movementPct: -0.6, movementDir: 'down', updatedAt: new Date().toISOString(), isStale: false },
  },
];
