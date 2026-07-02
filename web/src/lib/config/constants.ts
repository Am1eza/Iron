/**
 * Business-rule constants — from product/acceptance-criteria.md §1.4.
 * These are the app-side defaults; in production they come from admin Settings.
 */
export const CONSTANTS = {
  /** VAT rate (ارزش افزوده) — 10% */
  VAT_RATE: 0.1,

  /** Price freshness: "fresh" if updated within the current Jalali day. */
  PRICE_FRESH_WINDOW_DAYS: 0, // same Jalali day
  /** Beyond this many business days → hide price, show «تماس بگیرید». */
  PRICE_STALE_HIDE_AFTER_DAYS: 2,

  /** OTP */
  OTP_LENGTH: 5,
  OTP_TTL_SECONDS: 120,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_RESEND_PER_HOUR: 3,
  OTP_MAX_ATTEMPTS: 5,
  OTP_LOCK_MINUTES: 15,

  /** Ticker refresh interval (نبض بازار) */
  TICKER_REFRESH_SECONDS: 60,

  /** Session */
  SESSION_TTL_DAYS: 30,

  /** AI advisor (acceptance-criteria §D) */
  AI_TIMEOUT_MS: 20_000, // AC-D-9: never hang beyond 20s

  /** Currency unit label */
  CURRENCY_LABEL: 'تومان',
} as const;

export type Constants = typeof CONSTANTS;
