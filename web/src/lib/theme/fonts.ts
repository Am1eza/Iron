/**
 * Self-hosted variable fonts via `next/font/local` (still zero external
 * requests — ARCHITECTURE.md's "no external font/JS CDNs" rule is unaffected;
 * these are the exact same files that used to be declared with manual
 * `@font-face` in tokens.css). `next/font` computes fallback-matching
 * ascent/descent/line-gap/size-adjust metrics automatically, so the
 * fallback→web-font swap (`display: 'swap'`, kept from before) reflows far
 * less than a plain hand-written `@font-face` — a real CLS source on
 * first paint since Vazirmatn/Estedad's glyph metrics differ substantially
 * from the system fallback stack they swap in from.
 *
 * Each exposes a CSS custom property (`variable`) that tokens.css splices into
 * the existing `--font-fa`/`--font-display`/`--font-latin` stacks ahead of the
 * same fallback fonts as before — the visible font stack is unchanged.
 */
import localFont from 'next/font/local';

export const vazirmatn = localFont({
  src: '../../../public/fonts/Vazirmatn.var.woff2',
  variable: '--font-vazirmatn',
  display: 'swap',
  preload: true,
});

// Not wired into any font stack (tokens.css) or the root layout's className
// as of this comment — WebKit fails to render this font's GPOS mark
// (dot) attachment at every weight, dropping dots from letters like ق/ش/ز
// (turning them into ف/س/ر). Confirmed with an isolated static-instanced TTF
// too, so it's a bug in the font file's GPOS tables vs. WebKit's renderer,
// not something CSS/font-loading options can work around. Exported here in
// case a future, non-broken Estedad build replaces the file — don't re-add
// it to --font-display without re-testing in WebKit first.
export const estedad = localFont({
  src: '../../../public/fonts/Estedad.var.woff2',
  variable: '--font-estedad',
  display: 'swap',
  preload: false,
});

export const inter = localFont({
  src: '../../../public/fonts/Inter.var.woff2',
  variable: '--font-inter',
  display: 'swap',
  // Latin/numeral fallback only — not used above the fold, no reason to
  // compete with Vazirmatn/Estedad for early bandwidth.
  preload: false,
});
