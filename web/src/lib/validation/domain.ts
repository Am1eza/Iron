/**
 * Domain / business-rule validators — encode acceptance-criteria constants (§1.4).
 * UI mirrors these; the server enforces them authoritatively.
 */
import { format as jalali } from 'date-fns-jalali';
import { CONSTANTS } from '@/lib/config/constants';
import type { MovementDir } from '@/lib/types/domain';

/** نوسان — percent change + direction vs the previous published price. */
export function computeMovement(
  current: number,
  previous?: number,
): { pct: number | undefined; dir: MovementDir } {
  if (!previous || previous <= 0) return { pct: undefined, dir: 'flat' };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return { pct: rounded, dir: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat' };
}

const dayKey = (d: Date) => jalali(d, 'yyyyMMdd');

/** Fresh = updated on the current Jalali day (acceptance-criteria PRICE_FRESH_WINDOW). */
export function isPriceFresh(updatedAt: string | Date, now: Date = new Date()): boolean {
  const d = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  return dayKey(d) === dayKey(now);
}

/** Hide the price (→ «تماس بگیرید») when older than PRICE_STALE_HIDE_AFTER days. */
export function shouldHidePrice(updatedAt: string | Date, now: Date = new Date()): boolean {
  const d = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  return days > CONSTANTS.PRICE_STALE_HIDE_AFTER_DAYS;
}

/** Admin price-entry guard. */
export function isValidAdminPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/** Quote (پیش‌فاکتور) validity. */
export function isQuoteValid(validUntil: string | Date, now: Date = new Date()): boolean {
  const d = typeof validUntil === 'string' ? new Date(validUntil) : validUntil;
  return d.getTime() > now.getTime();
}
