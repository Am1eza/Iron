import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Unit/component test config (item 50 · Frontend Testing).
 * - jsdom environment + Testing Library + jest-dom matchers (vitest.setup.ts).
 * - `@/` alias mirrors tsconfig paths.
 * - CSS Modules return a proxy (className strings) so components render in tests.
 * E2E/accessibility (Playwright + axe) is separate: `pnpm test:e2e`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Pin the timezone. Jalali conversion is timezone-dependent, so
    // `isSameJalaliDay` (which decides the "yesterday's close" baseline for
    // every price-movement %) and every formatJalali assertion silently
    // depended on whatever TZ the machine running the suite happened to have —
    // green on CI, red on a developer's laptop, for reasons that have nothing
    // to do with the code.
    //
    // UTC, not Asia/Tehran, because UTC is what the PRODUCTION container
    // actually runs (`docker exec ahantime-web-1 date` → UTC; TZ is unset in
    // docker-compose.yml). Pinning the tests to the real deploy's timezone
    // means a Jalali test that passes here is a statement about production.
    // NOTE for a human: that also means production rolls a Jalali day over at
    // 03:30 Tehran time, not midnight. That is a product decision about price
    // baselines, not something to "fix" in the test config.
    env: { TZ: 'UTC' },
    // vitest's 5000ms default was tight enough to be a real CI flake, not a
    // safety margin: tests that spin up a real PGlite instance AND run a
    // real `sharp` re-encode (the I-206/207/209/212 upload-pipeline suites)
    // measure 1-6s locally on a fast machine and occasionally cleared 5s on
    // GitHub's shared 2-core runners under load — a genuine `Test timed out
    // in 5000ms`, not an assertion failure, confirmed by rerunning the exact
    // same file in isolation and having it pass in a fraction of that time.
    // 15s keeps real hangs/regressions catchable while giving slow/shared
    // CI hardware realistic room for what these tests actually do.
    testTimeout: 15_000,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    // `scripts/` is in here for one reason: some of what runs against
    // production lives there rather than in `src/`, and one of those things
    // (`scripts/lib/redirectRepair.ts`) now runs unattended on a systemd
    // timer and rewrites live URLs. Code with that reach has to be pinned by
    // a suite, not by a human reading its dry run. Only the pure planning
    // half is testable and only that half is imported — the scripts
    // themselves still open a real `pg` pool at module scope and are not
    // collected here.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts'],
    exclude: ['node_modules', '.next', 'e2e', 'tests/e2e'],
    server: {
      deps: {
        // next-intl/navigation's createNavigation (i18n/navigation.ts, added
        // for the URL-locale migration) does an internal `import 'next/
        // navigation'` that Vitest's default externalization can't resolve
        // through pnpm's nested node_modules layout ("Did you mean to
        // import next/navigation.js?"). Every OTHER next-intl export
        // (`useTranslations`, `NextIntlClientProvider`, ...) already worked
        // without this — only the navigation sub-path needs it processed by
        // Vite's own resolver instead of treated as pre-bundled.
        inline: [/next-intl/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', '**/*.d.ts'],
    },
  },
});
