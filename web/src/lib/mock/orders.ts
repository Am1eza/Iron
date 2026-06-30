/**
 * Mock orders / cargo shipments for order-tracking (request #11).
 * Demo data only — no backend.
 */
import type { Order } from '@/lib/types/domain';

const ORDERS: Order[] = [
  {
    ref: 'OR-۲۳۰۹',
    placedAt: '2026-06-22T06:30:00.000Z',
    status: 'in_transit',
    lastUpdate: '2026-06-29T11:15:00.000Z',
    items: [
      { skuId: 'reb-16', name: 'میلگرد آجدار سایز ۱۶', qty: 8, unit: 'kg', weightKg: 12000 },
      { skuId: 'reb-20', name: 'میلگرد آجدار سایز ۲۰', qty: 4, unit: 'kg', weightKg: 6000 },
    ],
  },
  {
    ref: 'OR-۲۳۱۴',
    placedAt: '2026-06-26T09:00:00.000Z',
    status: 'loading',
    lastUpdate: '2026-06-30T07:40:00.000Z',
    items: [{ skuId: 'sht-6', name: 'ورق سیاه ۶ میل', qty: 20, unit: 'sheet', weightKg: 18000 }],
  },
  {
    ref: 'OR-۲۲۹۸',
    placedAt: '2026-06-15T05:10:00.000Z',
    status: 'delivered',
    lastUpdate: '2026-06-24T13:25:00.000Z',
    items: [{ skuId: 'ibm-18', name: 'تیرآهن سایز ۱۸', qty: 6, unit: 'branch', weightKg: 9000 }],
  },
  {
    ref: 'OR-۲۳۲۰',
    placedAt: '2026-06-29T15:45:00.000Z',
    status: 'registered',
    lastUpdate: '2026-06-29T15:45:00.000Z',
    items: [{ skuId: 'pip-2', name: 'پروفیل قوطی ۴۰×۴۰', qty: 30, unit: 'branch', weightKg: 4200 }],
  },
];

/** All mock orders. */
export function getOrders(): Order[] {
  return ORDERS;
}

/** Find an order by its tracking ref (accepts Persian or Latin digits, case-insensitive). */
export function findOrder(ref: string): Order | undefined {
  const norm = (s: string) =>
    s
      .trim()
      .toUpperCase()
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\s-]/g, '');
  const target = norm(ref);
  return ORDERS.find((o) => norm(o.ref) === target);
}
