/**
 * Value-level PII scrub, shared by report.ts (logs) and sentry.ts (ingestion)
 * so both the log line AND the Sentry event are cleaned. A mobile embedded in
 * an error message, its STACK (V8 prefixes the stack with `Error: <message>`),
 * or an innocuous string value bypasses key-name filtering. `0/(+)98` + 9 digits
 * is distinctive enough not to hit prices/refs.
 */
const MOBILE_VALUE = /(?:\+?98|0)9\d{9}/g;

export function scrubMobile<T>(v: T): T {
  return typeof v === 'string' ? (v.replace(MOBILE_VALUE, '[redacted-mobile]') as unknown as T) : v;
}
