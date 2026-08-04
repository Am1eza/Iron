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
  // 15 min — SMS.ir handset delivery was MEASURED at up to ~11 minutes
  // (2026-07-24 delivery reports); the code must outlive the SMS ride.
  OTP_TTL_SECONDS: 900,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_RESEND_PER_HOUR: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_LOCK_MINUTES: 15,

  /** Ticker refresh interval (نبض بازار) */
  TICKER_REFRESH_SECONDS: 60,

  /** Session */
  SESSION_TTL_DAYS: 30,
  /**
   * Access-token lifetime. Was 15 minutes, which made staff re-login (and pay
   * for a fresh OTP SMS) after any short break — the refresh token is good for
   * 30 days, but nothing spent it on a server-side navigation, so an expired
   * access cookie went straight to the login screen. Now 4 hours, which covers
   * a work session, and the expiry is recovered silently anyway
   * (/api/auth/silent). Revocation is NOT weakened by the longer window:
   * every permission boundary calls getSessionVerified(), which re-checks
   * users.tokenVersion on each request, and any role/active change bumps it.
   *
   * W29 (audit area 2) — DELIBERATELY LEFT AT 4 HOURS, and this is the record
   * of why, so nobody re-opens it without the missing piece.
   *
   * The audit's finding was not that 4h is wrong; it is that every comment in
   * the codebase reasoned about 15 minutes while the value was 16x that. Those
   * comments are now corrected (session.ts, store.types.ts, schema/auth.ts)
   * rather than the number, because shortening the TTL moves load onto the
   * REFRESH path — and the refresh path is what logged staff out once already,
   * at the cost of an OTP SMS per recovery.
   *
   * The refresh path only just gained reuse detection, and it shipped in
   * `detect` mode (report, revoke nothing — see auth/refreshPolicy.ts) because
   * enforcement is an owner decision. Cutting the TTL now would multiply
   * traffic through a rotation path whose new enforcement behaviour has not
   * been observed in production for a single day.
   *
   * THE ORDER, for whoever picks this up:
   *   1. run with REFRESH_REUSE_DETECTION=detect until a week of logs shows
   *      zero `refresh_token_reuse` reports;
   *   2. switch to `enforce` and watch for the same period;
   *   3. only then move this to 30-60 minutes — NOT straight to 15. 30-60min
   *      already cuts the JWT-only revocation window by 4-8x, which is where
   *      almost all of the benefit is, while keeping silent-refresh traffic
   *      (and therefore the blast radius of any refresh bug) far below what
   *      15 minutes would produce.
   */
  ACCESS_TTL_SECONDS: 4 * 60 * 60,

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
