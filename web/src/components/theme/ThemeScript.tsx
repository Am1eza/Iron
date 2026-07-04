import Script from 'next/script';

/**
 * No-flash theme bootstrap. Runs before first paint to set `:root[data-theme]`
 * from the persisted preference (the `ahantime-ui` Zustand store), falling back to
 * the OS `prefers-color-scheme`. Prevents a light→dark flash on load (FOUC).
 * <StoreHydrator/> keeps it in sync afterwards.
 *
 * Served from `/public/theme-init.js` (same-origin, external) rather than
 * inline: an inline `<script>` would need a per-request CSP nonce, which
 * forces every page into dynamic rendering (no ISR/SSG) — see
 * `next.config.mjs`'s `Content-Security-Policy` header. An external,
 * same-origin file satisfies a plain `script-src 'self'` with none of that
 * cost, and is cacheable besides. `next/script`'s `beforeInteractive`
 * strategy is Next's own supported way to run a script this early
 * (blocking, before hydration) — a raw `<script src>` here would also trip
 * the `no-sync-scripts` lint rule. Keep this file's content byte-for-byte
 * in sync with what it used to inline if you ever touch the FOUC logic.
 */
export function ThemeScript() {
  // The `beforeInteractive` strategy IS supported in the App Router root
  // layout (this component is only ever rendered from layout.tsx) — this is
  // a confirmed ESLint false positive when the <Script> call is inside an
  // imported component rather than literally written in layout.tsx:
  // https://github.com/vercel/next.js/issues/56778
  // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
  return <Script src="/theme-init.js" strategy="beforeInteractive" />;
}
