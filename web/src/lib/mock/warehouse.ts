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
    // W20 — a RATE per ton/month, not a flat per-item fee (the demo values
    // used to be the flat total itself; kept the same real-world monthly
    // cost by dividing through the old tonnage).
    monthlyFeeToman: 75_000,
    storedAt: '2026-04-12T08:00:00.000Z',
    arrivedAt: '2026-04-12T08:00:00.000Z',
    location: 'سالن ۱ — ردیف ۳',
    contractRef: 'QR-1042',
    insured: true,
    status: 'stored',
  },
  {
    id: 'wh-2',
    ref: 'WH-۱۰۵۸',
    product: 'ورق سیاه',
    sizeLabel: 'ضخامت ۶ میل',
    quantityTons: 12,
    monthlyFeeToman: 90_000,
    storedAt: '2026-05-03T08:00:00.000Z',
    arrivedAt: '2026-05-04T08:00:00.000Z',
    location: 'سالن ۲ — ردیف ۱',
    insured: true,
    status: 'selling',
  },
  {
    id: 'wh-3',
    ref: 'WH-۱۰۶۷',
    product: 'تیرآهن',
    sizeLabel: 'سایز ۱۸',
    quantityTons: 9,
    monthlyFeeToman: 95_000,
    storedAt: '2026-05-21T08:00:00.000Z',
    insured: false,
    status: 'pending',
  },
  {
    id: 'wh-4',
    ref: 'WH-۱۰۲۹',
    product: 'نبشی',
    sizeLabel: '۱۰۰×۱۰۰',
    quantityTons: 6,
    monthlyFeeToman: 100_000,
    storedAt: '2026-03-08T08:00:00.000Z',
    arrivedAt: '2026-03-09T08:00:00.000Z',
    releasedAt: '2026-06-01T08:00:00.000Z',
    insured: true,
    status: 'released',
  },
];

/** All mock warehouse items (newest stored first not guaranteed — demo order). */
export function getWarehouseItems(): WarehouseItem[] {
  return ITEMS;
}
