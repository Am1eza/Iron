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
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~-]+/gi;
const TOKEN_QUERY_VALUE = /([?&](?:access_token|refresh_token|token|jwt)=)[^&#\s]+/gi;
// F-144: `auth/crypto.ts#randomToken` (refresh tokens, and every session-pepper
// hash stored alongside them) is ALWAYS `toHex(32 random bytes)` — 64
// lowercase hex characters, never shorter/longer, never mixed with `.`/`_`/`-`.
// Unlike a JWT or a `Bearer …` header, that value has no distinguishing prefix
// when it turns up bare inside a freeform error message, a thrown DB-driver
// string, or a URL path segment (not just a query param, which
// TOKEN_QUERY_VALUE already covers) — so none of the three patterns above ever
// matched it. A 64-hex-char run is not a shape any legitimate business value in
// this app takes (Toman prices/order refs are decimal + hyphenated, git SHAs
// are 40 chars) — case-insensitive since some drivers/tools uppercase hex.
const RAW_HEX_TOKEN_VALUE = /\b[0-9a-fA-F]{64}\b/g;

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
  if (typeof v !== 'string') return scrubEmail(scrubMobile(scrubBotToken(v)));
  const credentials = v
    .replace(BEARER_VALUE, 'Bearer [redacted-token]')
    .replace(JWT_VALUE, '[redacted-token]')
    .replace(TOKEN_QUERY_VALUE, '$1[redacted-token]')
    // Must run before scrubMobile below: a bare hex token can contain an
    // 11-digit run that happens to look like `09…`, and scrubbing mobiles
    // first would eat only that slice, leaving the rest of the secret in the
    // clear instead of the whole token being redacted (same ordering
    // rationale as BOT_TOKEN_VALUE's own comment above).
    .replace(RAW_HEX_TOKEN_VALUE, '[redacted-token]');
  return scrubEmail(scrubMobile(scrubBotToken(credentials))) as T;
}
