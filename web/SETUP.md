# Running Poladin Web locally

The site is a **Next.js 15** app (App Router, React 19, TypeScript). It runs
fully in **mock mode** — no backend, database, or API keys required.

## Quick start

```bash
cd web
cp .env.example .env.local      # defaults to NEXT_PUBLIC_API_MODE=mock
pnpm install
pnpm dev                        # http://localhost:3000
```

Production build:

```bash
pnpm build && pnpm start
```

Useful checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Notes on the local setup

A few things had to be fixed to get the app to install, type-check, build, and
serve every page locally:

1. **Dependency pin** — `date-fns-jalali` only publishes pre-release tags
   (e.g. `3.6.0-0`), so the `^3.6.0` range matched nothing on install. Pinned
   to the exact `3.6.0-0`.

2. **Strict-null type errors** — eight `possibly 'undefined'` errors (focus
   traps, tabs, OTP generator, intersection observer) blocked the production
   build. Fixed with optional chaining / guards.

3. **Persian (non-ASCII) route folders** — this is the important one.

### The non-ASCII route fix

Next.js does **not** serve App Router routes whose folder names contain
non-ASCII characters — visiting them returns `404` in both `dev` and
`start`. This is a long-standing Next.js limitation
(vercel/next.js discussion #62292, issue #37373).

Because every Persian URL on this site (`/قیمت`, `/ورود`, `/اخبار`, …) is a
non-ASCII folder, **all inner pages 404'd**. The fix is the documented
workaround: the route folders are stored under their **URL-encoded** names,
e.g.

```
src/app/قیمت        →  src/app/%D9%82%DB%8C%D9%85%D8%AA
src/app/ورود        →  src/app/%D9%88%D8%B1%D9%88%D8%AF
```

A browser always percent-encodes non-ASCII URLs, so a visit to `/قیمت`
requests `/%D9%82%DB%8C%D9%85%D8%AA`, which now matches the folder and serves
correctly. Dynamic params (e.g. `[category]`) are decoded by Next.js as usual,
so page code is unaffected. Only the static Persian path segments are encoded;
`[brackets]` and ASCII folders (`admin`, `styleguide`, `api`) are untouched.

Trade-off: the source folder names are no longer human-readable. If the team
prefers readable source, the alternative is to use **ASCII slugs**
(`/prices`, `/login`, …) as the real routes and keep Persian only as display
text — that is a larger product/SEO decision and was left as-is.

## Known gaps (not blocking)

- **Custom fonts** — `tokens.css` references `/fonts/Vazirmatn.var.woff2`,
  `Estedad.var.woff2`, `Inter.var.woff2`, but there is no `web/public/fonts`
  directory, so those 404 and the UI falls back to Tahoma / system fonts.
  Drop the woff2 files into `web/public/fonts/` to enable the intended type.
- Many deep feature pages (price tables, calculators) are intentional
  placeholders — the project is at Phase 5 (foundation → UX → UI → frontend →
  auth); feature content is built in later layers.
