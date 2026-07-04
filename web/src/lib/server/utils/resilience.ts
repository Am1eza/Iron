/**
 * Retry-with-backoff + a simple circuit breaker for outbound integrations
 * (tgju, SMS.ir) that previously made exactly one attempt and gave up —
 * transient blips (a dropped connection, a momentary 502) failed the whole
 * call instead of being absorbed.
 *
 * Deliberately NOT wired into the DeepSeek AI relay: that call streams an
 * SSE response and already has its own resilience story (a one-shot
 * fallback relay + abort timeouts, see integrations/deepseek.ts) — retrying
 * a partially-streamed completion is a different, riskier problem (partial
 * output, double token billing) than retrying an idempotent JSON fetch, and
 * bolting a generic wrapper on top would fight that existing design rather
 * than improve it.
 *
 * The circuit breaker is in-process state (a `Map`), same caveat as
 * `rateLimit.ts`: correct and sufficient on the single-container Docker
 * deploy, best-effort per-isolate on Cloudflare Workers (still meaningfully
 * reduces retry storms within one isolate's lifetime, just not shared
 * across them). Every existing caller already treats a failure here as
 * "fall back to last-known-value / report and move on", so a per-isolate
 * breaker is a strict improvement over none, not a correctness requirement.
 */
import { reportError } from '@/lib/errors/report';

type BreakerState = { consecutiveFailures: number; openUntil: number };
const breakers = new Map<string, BreakerState>();

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_OPEN_MS = 30_000;

export class CircuitOpenError extends Error {
  constructor(service: string) {
    super(`circuit open for ${service} — skipping the network call until it cools down`);
    this.name = 'CircuitOpenError';
  }
}

function breakerFor(service: string): BreakerState {
  let b = breakers.get(service);
  if (!b) {
    b = { consecutiveFailures: 0, openUntil: 0 };
    breakers.set(service, b);
  }
  return b;
}

/** Test-only: forget all breaker state between test files/cases. */
export function resetCircuitBreakers(): void {
  breakers.clear();
}

export interface ResilienceOptions {
  /** Extra attempts after the first (0 = no retry). Default 2. */
  retries?: number;
  /** Base delay for exponential backoff with jitter. Default 250ms. */
  baseDelayMs?: number;
  /** Only these failures are retried; others fail immediately. Default: always. */
  isRetryable?: (err: unknown) => boolean;
  /** Consecutive failures (post-retry) before the circuit opens. Default 3. */
  failureThreshold?: number;
  /** How long the circuit stays open once tripped. Default 30s. */
  openMs?: number;
}

/**
 * Runs `fn`, retrying transient failures with exponential backoff + jitter,
 * behind a per-`service` circuit breaker. Throws `CircuitOpenError`
 * immediately (no network call at all) while the breaker is open; every
 * existing caller (tgju, SMS.ir) already has a graceful fallback for any
 * thrown error, so this composes with their existing try/catch unchanged.
 */
export async function withResilience<T>(
  service: string,
  fn: () => Promise<T>,
  opts: ResilienceOptions = {},
): Promise<T> {
  const breaker = breakerFor(service);
  if (breaker.openUntil > Date.now()) {
    throw new CircuitOpenError(service);
  }

  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const isRetryable = opts.isRetryable ?? (() => true);
  const failureThreshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const openMs = opts.openMs ?? DEFAULT_OPEN_MS;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      breaker.consecutiveFailures = 0;
      return result;
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !isRetryable(err)) break;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= failureThreshold) {
    breaker.openUntil = Date.now() + openMs;
    reportError(new Error(`circuit opening for ${service} after ${breaker.consecutiveFailures} consecutive failures`), {
      integration: service,
    });
  }
  throw lastErr;
}
