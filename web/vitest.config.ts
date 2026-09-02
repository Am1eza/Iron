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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', '**/*.d.ts'],
    },
  },
});
