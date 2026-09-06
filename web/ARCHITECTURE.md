# Application architecture

The application includes frontend and backend in one Next.js App Router project. Product intent lives under `product/` and `foundation/`; implementation references below describe the current checkout.

## Structure and boundaries

| Path under `web/`                   | Responsibility                                                     |
| ----------------------------------- | ------------------------------------------------------------------ |
| `src/app/`                          | Pages, layouts, metadata and API route handlers                    |
| `src/components/`                   | Domain UI, shared primitives and interactive components            |
| `src/lib/server/`                   | Database schema, repositories, services, jobs, AI and integrations |
| `src/lib/auth/`                     | OTP, sessions, permissions and authentication guards               |
| `src/lib/api/`                      | HTTP transport and typed resource clients                          |
| `src/lib/validation/`               | Input schemas, request parsing and environment validation          |
| `src/lib/stores/`, `src/lib/query/` | Browser state and remote-data caching                              |
| `src/i18n/`                         | next-intl configuration and locale providers                       |
| `src/lib/mock/`                     | Development fixtures, selected by resource modules                 |
| `drizzle/`                          | SQL migrations and migration journal                               |
| `scripts/`, `e2e/`                  | Maintenance tools and browser tests                                |

Server Components are the default. Add `"use client"` for interactivity. Keep credentials and database access on the server; browser stores are not authorization boundaries. PostgreSQL uses Drizzle with `pg`; Redis supports caching and rate limits. Resource modules select mock/live data directly; MSW is not an installed dependency.

## Routing and data

Use [typed route builders](src/lib/routes.ts) for links. The project uses ASCII route segments with Persian labels. See [routing](ROUTING.md) for route families and middleware responsibilities.

Server catalog reads in [catalog.ts](src/lib/server/catalog.ts) use request-scoped React caching to share repeated reads. Client server-state uses TanStack Query; persistent local preferences and cart state use Zustand. See [state management](STATE-MANAGEMENT.md).

Validate inputs at server boundaries even when a form has already validated them. Financial calculations belong in domain/services code and preserve each SKU's price basis. The AI relay uses server tools and grounding checks; see [AI](AI.md).

## Styling and localization

CSS Modules consume semantic tokens from [application tokens](src/styles/tokens.css), aligned with the [design specification](../design/tokens.css). Use logical CSS properties, self-hosted fonts, accessible labels and Persian number/date formatting. No external UI kit or CDN.

## Runtime and configuration

The primary deployment is Node/Docker behind Caddy with PostgreSQL and Redis. Middleware uses Node APIs. A secondary Cloudflare target exists, but Node process caches and `pg` assumptions require target-specific validation; see [Cloudflare deployment](DEPLOY-CLOUDFLARE.md).

Security headers belong in [next.config.mjs](next.config.mjs). Environment requirements live in [env.ts](src/lib/validation/env.ts), and provider-neutral AI configuration lives in [aiRelayConfig.ts](src/lib/server/integrations/aiRelayConfig.ts). Production must not silently fall back to fixture prices.

## Engineering and verification

- Keep abstractions only when they have real consumers; check framework entry points and maintenance scripts before removing exports.
- Prefer typed resource imports, narrow Zustand selectors and explicit effect cleanup.
- Preserve session migrations, auth guards, price arithmetic and provider decisions.
- TypeScript enforces unused locals/parameters. Run the checks in [README](README.md).
- Regression tests cover request cancellation, body-read timeouts, nested dialogs, timer cleanup and route-cache invalidation. See the dated [review ledger](../docs/code-quality-review.md) for results and coverage limits.
