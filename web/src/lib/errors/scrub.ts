/**
 * Value-level PII scrub, shared by report.ts (logs) and sentry.ts (ingestion)
 * so both the log line AND the Sentry event are cleaned. A mobile/email
 * embedded in an error message, its STACK (V8 prefixes the stack with
 * `Error: <message>`), or an innocuous string value bypasses key-name
 * filtering. `0/(+)98` + 9 digits is distinctive enough not to hit prices/refs.
 */
const MOBILE_VALUE = /(?:\+?98|0)9\d{9}/g;
const EMAIL_VALUE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Deliberately NOT scrubbing a bare 10-digit «کد ملی» pattern here: this app's
// error context legitimately carries 10-digit Toman prices, project-estimate
// totals and weights (an order total or a large project's material cost is
// routinely a 10-digit number) — a blind \d{10} regex would redact business
// data far more often than it would ever catch a real national ID. National-ID
// values are covered by the KEY-NAME layer instead (REDACT_KEYS in report.ts
// matches `nationalId`/`melliCode`-shaped keys), which has no such collision
// risk because it only fires when the field is explicitly labeled.
export function scrubMobile<T>(v: T): T {
  return typeof v === 'string' ? (v.replace(MOBILE_VALUE, '[redacted-mobile]') as unknown as T) : v;
}

function scrubEmail<T>(v: T): T {
  return typeof v === 'string' ? (v.replace(EMAIL_VALUE, '[redacted-email]') as unknown as T) : v;
}

/** Runs every value-level scrubber. Order-independent (disjoint patterns). */
export function scrubPii<T>(v: T): T {
  return scrubEmail(scrubMobile(v));
}
