# Ahantime Web

Next.js 15 App Router + React 19 application with its API, PostgreSQL/Drizzle backend and admin panel. Persian-first, RTL, Jalali dates and Toman amounts.

## Local development

Use the package-manager version declared in [package.json](package.json) and a compatible Node installation.

```sh
cd web
pnpm install
cp .env.example .env.local
pnpm dev
```

Configure the local environment before starting. Mock catalog data is for development; authentication still calls real local route handlers. Live mode requires its database/session configuration. Production defaults to live and rejects mock configuration. See [environment validation](src/lib/validation/env.ts) and [API configuration](src/lib/api/config.ts). Never commit `.env.local` or print its secrets.

Fonts are already self-hosted; loading is configured in [fonts.ts](src/lib/theme/fonts.ts).

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm lint:css
pnpm test --run
pnpm exec playwright install chromium --only-shell
pnpm test:e2e --project=chromium
pnpm build
```

The browser suite uses the local test environment configured in [playwright.config.ts](playwright.config.ts). Do not run its Next dev server concurrently with a build in the same checkout: both write `.next`.

If the package-manager launcher is unavailable but dependencies are installed, run the corresponding binary under `./node_modules/.bin/` (for example `vitest run`, `next lint`, or `tsc --noEmit`). `pnpm format` rewrites the whole directory; format only intended files during a scoped change.

## Reference

- [Architecture](ARCHITECTURE.md), [routing](ROUTING.md), [state](STATE-MANAGEMENT.md)
- [API transport](API-CLIENT.md), [forms and validation](FORMS.md), [error handling](ERROR-HANDLING.md)
- [UI system](UI-SYSTEM.md), [UX engineering](UX-ENGINEERING.md), [AI advisor](AI.md)
- [Deployment](../DEPLOY.md), [documentation index](../docs/README.md)
