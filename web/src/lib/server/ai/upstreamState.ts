/**
 * Remembers that the AI relay is refusing work, so the app stops paying
 * for round trips it already knows will fail — and so the operator is told
 * ONCE per state transition rather than once per request.
 *
 * The condition this was built for is live in production right now: the relay
 * answers HTTP 402 (credit exhausted) and the route reported an error and
 * emitted a raw error frame on EVERY request. That is wrong twice over — the
 * visitor got «دستیار هوشمند با خطا مواجه شد» instead of being pointed at the
 * human path this business actually closes on, and the error tracker got one
 * new report per request.
 *
 * Reporting-on-transition is the pattern `utils/resilience.ts` established for
 * the circuit breaker (and for the same reason: GlitchTip groups by exception
 * value, and per-request reports buried the seven real issues under 1,932
 * duplicates). This reuses that rule rather than inventing a second one.
 *
 * In-process state, single long-lived container — same caveat and same
 * justification as the circuit breaker's own `Map`.
 */
export type UpstreamReason = 'credit' | 'auth' | 'rate_limit' | 'upstream';

/** How long to stop calling the relay after each kind of refusal.
 *  `credit`/`auth` are ACCOUNT-level: no retry can fix them, only a human
 *  topping up or rotating a key, so they cool down slowly. `rate_limit` and a
 *  generic failure are transient and recover on their own. */
const COOLDOWN_MS: Record<UpstreamReason, number> = {
  credit: 10 * 60_000,
  auth: 10 * 60_000,
  rate_limit: 60_000,
  upstream: 60_000,
};

/** Statuses that a retry can never fix — the relay is refusing the ACCOUNT,
 *  not this request. */
export function reasonForStatus(status: number | undefined): UpstreamReason {
  if (status === 402) return 'credit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  return 'upstream';
}

export function isPermanentReason(reason: UpstreamReason): boolean {
  return reason === 'credit' || reason === 'auth';
}

let current: { reason: UpstreamReason; until: number } | null = null;

/**
 * Record a refusal. Returns true only when this is a genuine TRANSITION —
 * either the first failure, or a change of reason — which is the caller's
 * signal to report it. A storm of identical failures reports once.
 */
export function noteUpstreamFailure(reason: UpstreamReason, now = Date.now()): boolean {
  const active = current && current.until > now ? current : null;
  const isTransition = !active || active.reason !== reason;
  current = { reason, until: now + COOLDOWN_MS[reason] };
  return isTransition;
}

/** The active refusal, or null when the relay is believed usable. */
export function upstreamUnavailable(now = Date.now()): UpstreamReason | null {
  if (!current || current.until <= now) return null;
  return current.reason;
}

/** A successful completion clears the state — recovery must not wait out the
 *  cooldown if the owner tops the account up straight away. */
export function noteUpstreamOk(): void {
  current = null;
}

/** Test-only. */
export function resetUpstreamState(): void {
  current = null;
}

/* ------------------------------- timeouts -------------------------------- */
/**
 * A request that ran past AI_TIMEOUT_MS is NOT the relay refusing work — the
 * relay is up, this one answer was slow — so it must not put the advisor into
 * the cooldown above and take it away from everyone else. It still needs to
 * reach the operator, but at most occasionally: measured latency on the
 * current reasoning model is wildly variable (6.8s / 48.8s / 6.7s on three
 * identical requests), so per-request reporting would be pure noise of exactly
 * the kind that buried the real issues under 1,932 duplicates.
 */
const TIMEOUT_REPORT_EVERY_MS = 10 * 60_000;
let lastTimeoutReport = 0;

/** True at most once per 10 minutes — the caller's cue to report. */
export function noteSlowTimeout(now = Date.now()): boolean {
  if (now - lastTimeoutReport < TIMEOUT_REPORT_EVERY_MS) return false;
  lastTimeoutReport = now;
  return true;
}

export function resetSlowTimeoutState(): void {
  lastTimeoutReport = 0;
}
