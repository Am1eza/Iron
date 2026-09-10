/**
 * Business-rule constants — from product/acceptance-criteria.md §1.4.
 * These are the app-side defaults; in production they come from admin Settings.
 */
/** A positive integer of milliseconds from env, or the default. A typo must
 *  never silently become 0 (an instantly-aborting request). */
function envMs(key: string, fallback: number): number {
  const raw = Number(process.env[key]?.trim());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

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
  // Ten minutes is the maximum OOB validity window; delayed deliveries beyond
  // it must be handled by resend rather than accepting an older secret longer.
  OTP_TTL_SECONDS: 600,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_RESEND_PER_HOUR: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_LOCK_MINUTES: 15,

  /** Ticker refresh interval (نبض بازار) — the tgju feed (usd/eur/gold18/ounce)
   *  and the client-side poll. */
  TICKER_REFRESH_SECONDS: 60,
  /** Billet (شمش فولاد) feed interval. Its upstream — a steel retailer's
   *  published price, not an exchange — reprices a few times a day, so it gets
   *  its own slower job rather than the 60s tick. See jobs/billetPoll.job.ts. */
  BILLET_REFRESH_SECONDS: 900,

  /** Session */
  SESSION_TTL_DAYS: 30,
  /**
   * Access-token lifetime. Silent refresh now recovers expired access cookies,
   * so one hour bounds the JWT exposure window without requiring another OTP
   * (/api/auth/silent). Revocation is NOT weakened by the longer window:
   * every permission boundary calls getSessionVerified(), which re-checks
   * users.tokenVersion on each request, and any role/active change bumps it.
   *
   * The refresh exchange is atomic and retains an absolute family expiry.
   */
  ACCESS_TTL_SECONDS: 60 * 60,

  /**
   * AI advisor deadline (acceptance-criteria §D).
   *
   * AC-D-9 said "never hang beyond 20s", and 20s was right for the model this
   * was written against. It is not right for the one the owner moved to: that
   * model reasons before it answers, and a price question costs TWO relay
   * round trips (model → tool → model). Measured on the live endpoint with
   * the real Persian system prompt, three identical requests: 6.8s, 48.8s,
   * 6.7s. The median is comfortable; the tail is not, and it is the model's,
   * not something this code can shorten (reasoning is already capped — see
   * aiRelayConfig.ts, and dropping it to `none` stops tool calling entirely,
   * which breaks grounding).
   *
   * So 20s did not protect anyone: it guaranteed an error on every
   * tool-using question — which is every price question, i.e. the product.
   * 45s covers the great majority of that distribution. The AC's intent is
   * "never hang forever", and three things still honour it: this hard
   * deadline, the user's own Stop button (AdvisorChat aborts in flight), and
   * — new — a timeout now degrades to the SAME graceful human-path message as
   * any other AI outage instead of a raw error frame, with the client falling
   * back to the local grounded engine. Env-tunable so the owner can retune
   * from measurements without a rebuild.
   */
  AI_TIMEOUT_MS: envMs('AI_TIMEOUT_MS', 45_000),
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
