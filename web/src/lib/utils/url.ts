/**
 * One parser-based answer to "is this string a same-origin URL?".
 *
 * Three places in this codebase independently decided that question with a
 * `^\/`-style regex — `safeHref`/`normalizeImageSrc` (article bodies),
 * `internalPathSchema` (redirects, article `seo.canonical`) and the article
 * SEO sink in `lib/seo.ts` — and all three were wrong in the same way. A regex
 * cannot answer it, because the WHATWG URL parser normalises input BEFORE it
 * decides where the authority ends:
 *
 *   - `\` is treated as `/` for special schemes, so `/\evil.com` and
 *     `/\/evil.com` both resolve to `https://evil.com/`;
 *   - TAB, CR, LF and C0 controls are stripped anywhere in the string, so
 *     `/<TAB>/evil.com` also resolves to `https://evil.com/` and
 *     `ja<TAB>vascript:x` resolves to the `javascript:` scheme;
 *   - `//evil.com` is scheme-relative and inherits the page's protocol.
 *
 * So: ask the parser, and reject the characters that exist only to confuse it.
 * A legitimate href/path never contains a backslash or a control character —
 * rejecting them outright is both safer and less surprising than silently
 * rewriting an editor's input into something they did not type.
 */

/** Parse base only — never emitted. Matches `lib/seo.ts`'s `SITE_URL`. */
export const SITE_ORIGIN: string = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com').origin;
  } catch {
    return 'https://ahantime.com';
  }
})();

/**
 * Characters the URL parser removes or re-interprets before deciding the
 * authority: C0 controls (incl. TAB/CR/LF), DEL, and the backslash.
 */
// eslint-disable-next-line no-control-regex
export const URL_CONFUSABLES = /[\u0000-\u001F\u007F\\]/;

/** `new URL()` that returns null instead of throwing. */
export function resolveUrl(value: string, base: string = SITE_ORIGIN): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** Does this string carry an explicit scheme (`https:`, `javascript:`, …)? */
export function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * A site-relative path that is STILL site-relative once resolved.
 *
 * Tolerates a missing leading slash because `redirectsRepo.normalizePath`
 * adds one — the value that eventually reaches the sink is `/${v}`, so that
 * is the form that must be judged. Anything carrying a scheme is rejected
 * outright (otherwise `https://evil.com/x` would become the merely nonsensical
 * path `/https://evil.com/x` rather than the input error it is).
 */
export function isInternalPathValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (URL_CONFUSABLES.test(v)) return false;
  if (hasScheme(v)) return false;
  const u = resolveUrl(v.startsWith('/') ? v : `/${v}`);
  return !!u && u.origin === SITE_ORIGIN;
}
