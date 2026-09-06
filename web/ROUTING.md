# Routing

[src/lib/routes.ts](src/lib/routes.ts) is the source for URL builders. The implementation uses ASCII route segments; Persian text belongs in labels and content. The former Persian-path proposal is retired.

## Route families

| URL                                               | Purpose                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `/`, `/prices`                                    | Home and catalog overview                                             |
| `/prices/[category]/[sub]/[sku]`                  | Category, subcategory and SKU hierarchy; each parent has its own page |
| `/prices/[category]/factory/[factory]`            | Factory landing page                                                  |
| `/prices/[category]/size/[size]`                  | Size landing page                                                     |
| `/ai`, `/market`, `/tools/[tool]`                 | Advisor, ticker and calculators                                       |
| `/cart`, `/request`, `/track`, `/account`         | Inquiry and customer workflows                                        |
| `/warehouse`, `/cut-to-size`, `/tender`, `/club`  | Customer services                                                     |
| `/blog`, `/news`                                  | Content archives; pagination uses `/page/[n]`                         |
| `/blog/[slug]`, `/news/[slug]`                    | Articles                                                              |
| `/blog/category/[category]`, `/news/topic/[slug]` | Content collections                                                   |
| `/cooperation`, `/cooperation/[track]`            | Cooperation intake                                                    |
| `/about`, `/contact`, `/terms`, `/privacy`        | Company and legal pages                                               |
| `/login`, `/search`                               | Authentication and search                                             |
| `/admin/*`, `/api/admin/*`                        | Admin UI and APIs with host/session/role restrictions                 |

`factory` and `size` are reserved subcategory slugs. Use the route-builder types for supported tools, cooperation tracks and account tabs. Article page 1 has the bare archive URL. Validate login `next` values with `safeNextPath`.

## Middleware and authorization

[middleware.ts](src/middleware.ts) handles panel-host routing, authentication gates, redirects and public-path checks. Production enforces auth; the public host hides admin routes with a hard 404. Route handlers must also enforce their own authorization.

[knownPaths.ts](src/lib/server/seo/knownPaths.ts) shares a process cache across module copies, coalesces refreshes and invalidates obsolete in-flight loads. This is process-local state, not cross-instance synchronization. Verify behavior separately for other runtime targets.

Security headers are configured in [next.config.mjs](next.config.mjs), not duplicated in middleware.

## Rendering and SEO

Pages own their rendering/revalidation settings; do not infer ISR behavior from the URL alone. Await Next 15 server `params` and `searchParams` where required. Public pages supply metadata and structured data; sitemap and robots rules live in [sitemap.ts](src/app/sitemap.ts) and [robots.ts](src/app/robots.ts).

Missing dynamic records must produce the intended HTTP status, not merely a not-found-looking page. Browser tests cover catalog create/delete navigation. Loading and error boundaries live beside their route segments. See [error handling](ERROR-HANDLING.md).
