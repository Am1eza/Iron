/**
 * Throttle + coalescing for the GlitchTip → SMS alert relay (W29, audit
 * area 16).
 *
 * The problem this exists for is not "too many alerts", it is that the thing
 * being alerted about is usually a STORM. GlitchTip has 1939 issues recorded;
 * a single bad deploy produces hundreds of events a minute, and a naive relay
 * would turn that into hundreds of paid SMS — a self-inflicted denial of the
 * SMS balance that OTP LOGIN depends on. Being late to an alert costs minutes;
 * emptying the SMS credit locks every staff member and customer out of the
 * site. So the throttle is deliberately aggressive and fails towards silence.
 *
 * Two independent limits:
 *
 *  1. COALESCE window — at most one SMS per window (default 5 min). Alerts
 *     arriving inside it are counted, not sent, and the count rides along in
 *     the next message ("+12 more"), so nothing is silently lost.
 *  2. HOURLY cap — a hard ceiling on messages per rolling hour (default 4).
 *     Once hit, nothing is sent until the hour rolls, however many alerts
 *     arrive.
 *
 * State is in-process on purpose. This deployment is a single long-lived Node
 * container (the same property `middleware.ts` documents for its redirect
 * cache), so a module-level map is correct here and cannot fail open the way a
 * Redis blip could — and failing open is precisely the SMS storm. If the
 * process restarts, the worst case is one extra SMS.
 */
export interface ThrottleDecision {
  send: boolean;
  /** Alerts swallowed since the last SMS — reported in the message we do send. */
  suppressed: number;
  /** Why nothing is being sent (for the JSON response / logs). */
  reason?: 'coalesced' | 'hourly_cap';
}

export const DEFAULT_COALESCE_SECONDS = 300;
export const DEFAULT_MAX_PER_HOUR = 4;

function envInt(raw: string | undefined, fallback: number, min: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

export function coalesceMs(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  return envInt(env.ALERT_RELAY_COALESCE_SECONDS, DEFAULT_COALESCE_SECONDS, 0) * 1000;
}
export function maxPerHour(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  return envInt(env.ALERT_RELAY_MAX_SMS_PER_HOUR, DEFAULT_MAX_PER_HOUR, 0);
}

const state = {
  /** Epoch ms of each SMS actually sent, trimmed to the last hour. */
  sentAt: [] as number[],
  /** Alerts dropped since the last SMS. */
  suppressed: 0,
};

/**
 * Decide whether THIS alert should become an SMS, and consume the decision.
 * Calling it twice for one alert would double-count — call it exactly once.
 */
export function admitAlert(now = Date.now(), env: Partial<NodeJS.ProcessEnv> = process.env): ThrottleDecision {
  const HOUR = 60 * 60 * 1000;
  state.sentAt = state.sentAt.filter((t) => now - t < HOUR);

  const last = state.sentAt[state.sentAt.length - 1];
  if (last !== undefined && now - last < coalesceMs(env)) {
    state.suppressed += 1;
    return { send: false, suppressed: state.suppressed, reason: 'coalesced' };
  }
  if (state.sentAt.length >= maxPerHour(env)) {
    state.suppressed += 1;
    return { send: false, suppressed: state.suppressed, reason: 'hourly_cap' };
  }

  const suppressed = state.suppressed;
  state.sentAt.push(now);
  state.suppressed = 0;
  return { send: true, suppressed };
}

/** Test-only reset — the state is module-level by design (see the docblock). */
export function resetAlertThrottle(): void {
  state.sentAt = [];
  state.suppressed = 0;
}
