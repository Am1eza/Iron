/**
 * One rule, stated once: **never prerender a page from the mock fixtures.**
 *
 * The problem
 * -----------
 * `generateStaticParams` runs at build time, and the production image is built
 * in CI with no `DATABASE_URL`. `isLiveCatalog()` is false there, so every
 * catalog/article helper answers from `lib/mock` — and any params derived from
 * it are fixture slugs. Next then *renders and bakes* those pages into the
 * image, complete with fixture prices.
 *
 * That is not merely wasted build output. The deploy recreates the web
 * container from the image, restoring those bodies, and every affected segment
 * carries `revalidate` — so under stale-while-revalidate the first visitor
 * after each deploy is served the baked page. On `/prices/*` that means
 * fabricated prices, on a site whose first locked product decision is that
 * prices are 100% admin-entered (CLAUDE.md §1). Measured on the live image:
 * 295 prerendered `/prices/**` HTML files, and `prices/rebar.html` was 320 kB
 * of fixture rows against 197 kB of real ones.
 *
 * The rule
 * --------
 * Return `[]` unless the fixtures *are* the intended content. There is exactly
 * one such build: the `EXPORT=1` GitHub Pages preview, which runs with
 * `NEXT_PUBLIC_API_MODE=mock`, has no server to render on demand, and would
 * otherwise publish an empty catalog. Everywhere else `[]` costs only a
 * first-visitor SSR per URL — the segments keep their `revalidate`, so ISR
 * still caches them from the first hit onward, now from real data.
 *
 * Slug sets that are *fixed in code* (`/tools/[tool]`, `/cooperation/[track]`)
 * are not fixtures and do not go through here — they are always safe to
 * prerender.
 */
export function shouldPrerenderMockParams(): boolean {
  return process.env.EXPORT === '1';
}
