/**
 * Throttle + coalescing for the GlitchTip → Telegram alert relay (W29, audit
 * area 16).
 *
 * The problem this exists for is not "too many alerts", it is that the thing
 * being alerted about is usually a STORM. GlitchTip has 1939 issues recorded;
 * a single bad deploy produces hundreds of events a minute, and a naive relay
 * would forward every one of them.
 *
 * WHY THE NUMBERS MOVED (SMS → Telegram). Under SMS.ir each alert was a paid
 * message drawn from the same balance OTP LOGIN depends on, so the limits were
 * set as low as they could usefully go: 1 per 5 minutes, 4 per hour. Telegram
 * is free and unmetered, so cost is no longer the binding constraint. Three
 * others are, and they set the new numbers:
 *
 *  1. Telegram's own per-chat limit is about one message per second / ~20 per
 *     minute; exceed it and the bot gets a 429 with a retry_after. A 60-second
 *     coalesce window keeps the relay an order of magnitude inside that
 *     ceiling even at full tilt.
 *  2. OPERATOR ATTENTION. A channel that pings 300 times in a deploy is a
 *     channel that gets muted, and a muted alert channel is worse than no
 *     alert channel. One message a minute is readable.
 *  3. THE FEEDBACK LOOP. A delivery failure is itself reported, which becomes
 *     a GlitchTip issue, which webhooks back here. A hard hourly ceiling is
 *     the outer bound on that loop regardless of what the inner circuit
 *     breaker does.
 *
 * So: at most one message per COALESCE window (default 60s, was 300s) and a
 * hard ceiling of MAX_PER_HOUR messages per rolling hour (default 20, was 4).
 * Twenty an hour means a genuine storm gives the operator ~20 minutes of live
 * updates and then goes quiet until the hour rolls — deliberately a ceiling,
 * not a rate. Suppressed alerts are counted and the count rides along in the
 * next message that does go out ("+12 more"), so nothing is silently lost.
 *
 * State is in-process on purpose. This deployment is a single long-lived Node
 * container (the same property `middleware.ts` documents for its redirect
 * cache), so a module-level object is correct here and cannot fail open the
 * way a Redis blip could — and failing open is precisely the message storm. If
 * the process restarts, the worst case is one extra message.
 */
export interface ThrottleDecision {
  send: boolean;
  /** Alerts swallowed since the last message — reported in the one we do send. */
  suppressed: number;
  /** Why nothing is being sent (for the JSON response / logs). */
  reason?: 'coalesced' | 'hourly_cap';
}

export const DEFAULT_COALESCE_SECONDS = 60;
export const DEFAULT_MAX_PER_HOUR = 20;

function envInt(raw: string | undefined, fallback: number, min: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

export function coalesceMs(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  return envInt(env.ALERT_RELAY_COALESCE_SECONDS, DEFAULT_COALESCE_SECONDS, 0) * 1000;
}
export function maxPerHour(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  return envInt(env.ALERT_RELAY_MAX_PER_HOUR, DEFAULT_MAX_PER_HOUR, 0);
}

const state = {
  /** Epoch ms of each message actually sent, trimmed to the last hour. */
  sentAt: [] as number[],
  /** Alerts dropped since the last message. */
  suppressed: 0,
};

/**
 * Decide whether THIS alert should become a message, and consume the decision.
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
