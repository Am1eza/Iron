import Script from 'next/script';

/**
 * No-flash locale bootstrap — sets `<html lang dir>` from the persisted
 * locale cookie before first paint. Mirrors ThemeScript's exact pattern and
 * rationale: an inline `<script>` would need a per-request CSP nonce, which
 * forces every page into dynamic rendering (no ISR/SSG) — see
 * `next.config.mjs`'s Content-Security-Policy header and
 * `AuthHydrator`'s header comment for why this app avoids that entirely.
 * An external, same-origin, `beforeInteractive` script satisfies a plain
 * `script-src 'self'` with none of that cost, and is cacheable besides.
 *
 * This only fixes `lang`/`dir` before paint (attribute flip, same trick as
 * the theme's `data-theme`); the actual translated *text* swap for a
 * returning non-default-locale visitor happens in `LocaleProvider`'s
 * client-side effect, which is not before-paint (a client rerun of the
 * whole visible text tree that early isn't practical the way one attribute
 * is) — see that file's header comment for the accepted trade-off.
 */
export function LocaleScript() {
  // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
  return <Script src="/locale-init.js" strategy="beforeInteractive" />;
}
