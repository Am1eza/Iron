/**
 * Value-level PII scrub, shared by report.ts (logs) and sentry.ts (ingestion)
 * so both the log line AND the Sentry event are cleaned. A mobile/email
 * embedded in an error message, its STACK (V8 prefixes the stack with
 * `Error: <message>`), or an innocuous string value bypasses key-name
 * filtering. `0/(+)98` + 9 digits is distinctive enough not to hit prices/refs.
 */
const MOBILE_VALUE = /(?:\+?98|0)9\d{9}/g;
// The final label must be ALPHABETIC. Without that anchor this also matched
// every `package@1.2.3` in a stack trace — every frame under
// node_modules/.pnpm/ became `[redacted-email]`, so the one thing a stack is
// for (which package threw) was destroyed on exactly the errors most in need
// of it. A real address ends in letters; a version ends in digits.
const EMAIL_VALUE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;

// Deliberately NOT scrubbing a bare 10-digit «کد ملی» pattern here: this app's
// error context legitimately carries 10-digit Toman prices, project-estimate
// totals and weights (an order total or a large project's material cost is
// routinely a 10-digit number) — a blind \d{10} regex would redact business
// data far more often than it would ever catch a real national ID. National-ID
// values are covered by the KEY-NAME layer instead (REDACT_KEYS in report.ts
// matches `nationalId`/`melliCode`-shaped keys), which has no such collision
// risk because it only fires when the field is explicitly labeled.
// Telegram bot tokens: `<bot-id>:<35-char secret>`, e.g.
// `8123456789:AAH-abc_DEF…`. Unlike every other credential in this codebase
// this one is a BEARER SECRET THAT TRAVELS IN A URL PATH — Telegram's API
// accepts it nowhere else — so the usual defence (a `token`-shaped KEY name in
// REDACT_KEYS) does not fire: it appears inside an ordinary string value like
// `https://<hop>/bot<TOKEN>/sendMessage`. `fetch` implementations and proxies
// routinely put the request URL in an error message, and that message goes
// straight to the log line and to GlitchTip — publishing the credential to the
// error tracker. Matching the token itself (not the `/bot` prefix) also covers
// it appearing bare in a config dump.
//
// The digits:secret shape with a >=30-char base64url tail is distinctive; a
// Toman price, a timestamp or a `key: value` log fragment cannot reach it.
//
// NO leading `\b`: the token's most dangerous appearance is `/bot8123456789:…`,
// where `t` and `8` are both word characters so there is no boundary between
// them — an anchored pattern matched nothing there and the mobile scrubber
// then chewed the bot id, leaving the secret half in the clear. That exact
// case is a test.
const BOT_TOKEN_VALUE = /\d{5,16}:[A-Za-z0-9_-]{30,}/g;

function scrubBotToken<T>(v: T): T {
  return typeof v === 'string' ? (v.replace(BOT_TOKEN_VALUE, '[redacted-token]') as unknown as T) : v;
}

export function scrubMobile<T>(v: T): T {
  return typeof v === 'string' ? (v.replace(MOBILE_VALUE, '[redacted-mobile]') as unknown as T) : v;
}

function scrubEmail<T>(v: T): T {
  return typeof v === 'string' ? (v.replace(EMAIL_VALUE, '[redacted-email]') as unknown as T) : v;
}

/**
 * Runs every value-level scrubber. The bot token goes FIRST and that ordering
 * is load-bearing: a token id such as `09123456789…` matches the mobile
 * pattern, so scrubbing mobiles first would rewrite the id half, leave the
 * BOT_TOKEN_VALUE pattern unable to match, and publish the secret half of the
 * credential in the clear. Mobile and email remain order-independent of each
 * other (disjoint patterns).
 */
export function scrubPii<T>(v: T): T {
  return scrubEmail(scrubMobile(scrubBotToken(v)));
}
