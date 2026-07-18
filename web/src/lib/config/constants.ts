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

  /** OTP.
   *  TTL: measured SMS delivery latency to Iranian MVNOs (Shatel 0905 via the
   *  SMS.ir shared verify line) is ~5 minutes — a 120s TTL meant every code
   *  was expired on arrival. 600s (NIST 800-63B's ceiling for SMS OOB
   *  secrets) keeps late-delivered codes usable; the 5-attempt cap +
   *  single-use + 15-min lock keep brute-force off the table. */
  OTP_LENGTH: 6,
  OTP_TTL_SECONDS: 600,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_RESEND_PER_HOUR: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_LOCK_MINUTES: 15,

  /** Ticker refresh interval (نبض بازار) */
  TICKER_REFRESH_SECONDS: 60,

  /** Session */
  SESSION_TTL_DAYS: 30,

  /** AI advisor (acceptance-criteria §D) */
  AI_TIMEOUT_MS: 20_000, // AC-D-9: never hang beyond 20s
  /** Independent, shorter budget for the ONE fallback-relay retry inside
   *  fetchCompletion — only spent when the primary leg failed/timed out AND
   *  the user is still there (never on a real user abort). Worst-case total
   *  for a single completion call becomes AI_TIMEOUT_MS + this, and only on
   *  the (rare, opt-in — requires FALLBACK_BASE_URL/KEY) path where the
   *  primary relay is down or hanging. */
  AI_FALLBACK_TIMEOUT_MS: 8_000,

  /** Currency unit label */
  CURRENCY_LABEL: 'تومان',
} as const;

export type Constants = typeof CONSTANTS;
