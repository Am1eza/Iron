# Ahantime Web — Routing
## Layer 4 · Frontend — Document 2 (Routing)

**Version:** 1.0 · 26 June 2026
**Builds on:** `product/information-architecture.md` (sitemap/URLs/SEO), `product/navigation.md`, `next.config.mjs`.
**Purpose:** Implement the IA sitemap as Next.js App Router routes — with rendering strategy, metadata/SEO, indexability, special files, and middleware.

## 1. Principles
- **Routes mirror IA §3** exactly — Persian slugs (Next supports non-ASCII segments).
- **SEO-first:** every public price/SKU/article route is SSR/ISR + unique metadata + schema.org (acceptance-criteria §1.7).
- **One canonical URL per node;** filters live in query params (`rel=canonical` to the base).
- **Admin + personal routes are `noindex`** (headers in `next.config.mjs` + `robots.ts`).
- **Typed URLs only:** build links via `lib/routes.ts` — never hardcode Persian paths in components.

## 2. Route Map (IA → files → rendering → index)
| URL (IA) | File | Render | Index |
|---|---|---|---|
| `/` | `app/page.tsx` | static shell + client ticker/AI | ✓ |
| `/قیمت` | `app/قیمت/page.tsx` | ISR | ✓ |
| `/قیمت/{cat}` | `app/قیمت/[category]/page.tsx` | ISR + `generateStaticParams` | ✓ |
| `/قیمت/{cat}/{sub}` | `app/قیمت/[category]/[sub]/page.tsx` | ISR (short revalidate) | ✓ (primary SEO) |
| `/قیمت/{cat}/{sub}/{sku}` | `…/[sku]/page.tsx` | ISR + `generateMetadata` (Product/Offer) | ✓ (long-tail) |
| `/آهن‌تایم` | `app/آهن‌تایم/page.tsx` | dynamic (client) | ✓ (landing) |
| `/طلا-و-ارز` | `app/طلا-و-ارز/page.tsx` | static shell + client | ✓ |
| `/ابزار/{tool}` | `app/ابزار/[tool]/page.tsx` | static | ✓ |
| `/حساب`, `/حساب/{tab}` | `app/حساب/[[...tab]]/page.tsx` | dynamic | ✗ noindex |
| `/باشگاه` | `app/باشگاه/page.tsx` | static | ✓ |
| `/وبلاگ`, `/وبلاگ/{slug}` | `app/وبلاگ/...` | ISR/SSG + Article schema | ✓ |
| `/اخبار`, `/اخبار/{slug}` | `app/اخبار/...` | ISR/SSG + Article schema | ✓ |
| `/همکاری`, `/همکاری/{track}` | `app/همکاری/...` | static | ✓ |
| `/سبد-استعلام` | `app/سبد-استعلام/page.tsx` | dynamic | ✗ |
| `/درخواست` | `app/درخواست/page.tsx` | dynamic | ✗ |
| `/ورود` | `app/ورود/page.tsx` | dynamic | ✗ |
| `/جستجو` | `app/جستجو/page.tsx` | dynamic | ✗ |
| `/درباره-ما`,`/تماس`,`/چرا-آهن‌تایم` | resp. folders | static (+ LocalBusiness on تماس) | ✓ |
| `/قوانین`,`/حریم-خصوصی` | resp. folders | static | ✓ |
| `/admin/*` | `app/admin/...` | dynamic, role-gated | ✗ noindex |

## 3. Special files
- `app/loading.tsx` — skeleton (no blank flash; aligns with empty-states anti-flash).
- `app/not-found.tsx` — branded 404 (empty-state pattern: search + popular categories + AI + home).
- `app/error.tsx` — client error boundary (Persian, retry; no English/stack).
- `app/sitemap.ts` / `app/robots.ts` — generated SEO files.
- Per-section `loading.tsx`/`error.tsx` can override (e.g., the price table skeleton).

## 4. Metadata & SEO
- Global defaults in `app/layout.tsx`; per-route `generateMetadata` (catalog/SKU/article) builds title patterns (IA §7) + canonical + OG.
- **JSON-LD** via `lib/seo.ts`: `Organization` (sitewide), `BreadcrumbList` (catalog), `Product`+`Offer` (SKU), `Article` (blog/news), `LocalBusiness` (contact). Injected as `<script type="application/ld+json">`.

## 5. Middleware (`middleware.ts`)
- Security headers (baseline; CSP added later).
- **Auth gating** structure for `/admin` (and account) — redirect to `/ورود?next=…` when no session (enabled once auth ships; pass-through in mock).
- Canonical host/redirects can be added here.
- *(Note: admin/personal `noindex` is enforced via `next.config.mjs` headers + `robots.ts`; Persian-path auth gating is also enforced at the route/layout level to avoid encoded-path matcher pitfalls.)*

## 6. Rendering strategy notes
- **Prices change intraday** (admin-entered): sub-category tables use **ISR with a short `revalidate`** + client refresh of the freshness/ticker; never cache a stale price as "fresh" (acceptance-criteria — show real date / «تماس بگیرید»).
- **Popular SKUs/categories** pre-generated via `generateStaticParams`; the long tail renders on-demand (ISR).
- **Interactive routes** (AI, cart, account, admin) are dynamic/client.

## 7. API routes (`app/api/*` — server-only)
`ai/chat` (DeepSeek relay + tools, streaming) · `auth/otp/request|verify` (Kavenegar) · `leads` (request→proforma→SMS→CRM) · `market` (tgju + billet) · `tools/weight|estimate`. All keep secrets server-side; mock-mode returns fixtures.

## 8. Conventions
- Next 15: `params`/`searchParams` are **async (Promises)** in server components — `await` them.
- Use `lib/routes.ts` for all links; `lib/seo.ts` for all metadata/JSON-LD.
- `notFound()` for missing slugs; `redirect()` for moved/legacy.

*Ahantime — اول مشورت، بعد خرید.*
