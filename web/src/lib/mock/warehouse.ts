/**
 * Mock consigned-stock items for the «انبار مشتریان» feature (request #7).
 * Demo data only — no backend.
 */
import type { WarehouseItem } from '@/lib/types/domain';

const ITEMS: WarehouseItem[] = [
  {
    id: 'wh-1',
    ref: 'WH-۱۰۴۲',
    product: 'میلگرد آجدار',
    sizeLabel: 'سایز ۱۶',
    quantityTons: 24,
    monthlyFeeToman: 1_800_000,
    storedAt: '2026-04-12T08:00:00.000Z',
    status: 'stored',
  },
  {
    id: 'wh-2',
    ref: 'WH-۱۰۵۸',
    product: 'ورق سیاه',
    sizeLabel: 'ضخامت ۶ میل',
    quantityTons: 12,
    monthlyFeeToman: 1_100_000,
    storedAt: '2026-05-03T08:00:00.000Z',
    status: 'selling',
  },
  {
    id: 'wh-3',
    ref: 'WH-۱۰۶۷',
    product: 'تیرآهن',
    sizeLabel: 'سایز ۱۸',
    quantityTons: 9,
    monthlyFeeToman: 850_000,
    storedAt: '2026-05-21T08:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'wh-4',
    ref: 'WH-۱۰۲۹',
    product: 'نبشی',
    sizeLabel: '۱۰۰×۱۰۰',
    quantityTons: 6,
    monthlyFeeToman: 600_000,
    storedAt: '2026-03-08T08:00:00.000Z',
    status: 'released',
  },
];

/** All mock warehouse items (newest stored first not guaranteed — demo order). */
export function getWarehouseItems(): WarehouseItem[] {
  return ITEMS;
}
