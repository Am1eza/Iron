import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config — drives the real live-mode app (actual API routes, actual
 * `pg.Pool`) against an ephemeral in-process Postgres (scripts/e2e-db.ts:
 * pglite over a real wire-protocol TCP socket), so this needs no Docker or
 * external Postgres. `webServer` starts both processes and tears them down
 * after the run. pglite is effectively single-connection under load, so
 * tests run serially (workers: 1) rather than in parallel.
 */
const DB_PORT = 55433;
const APP_PORT = 3100;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `tsx scripts/e2e-db.ts`,
      port: DB_PORT,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { E2E_DB_PORT: String(DB_PORT) },
    },
    {
      command: `next dev -p ${APP_PORT}`,
      url: `${BASE_URL}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      // Explicit, deterministic env for the spawned dev server — does not
      // rely on (and overrides) anything in a developer's local .env.local.
      // SMSIR_*/AI_ENABLED deliberately unset: NODE_ENV stays 'development'
      // here (never 'production'), so live mode boots without them per
      // env.ts, and OTP falls back to its real dev-log path (devCode in the
      // response) instead of trying to send a real SMS.
      env: {
        DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
        NEXT_PUBLIC_API_MODE: 'live',
        NEXT_PUBLIC_SITE_URL: BASE_URL,
        SESSION_SECRET: 'e2e-test-session-secret-not-for-real-use-0000',
        AUTH_ENFORCED: 'true',
        AI_ENABLED: 'false',
        SMSIR_API_KEY: '',
        SMSIR_TEMPLATE_ID: '',
        SEED_ON_START: 'false',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // This sandbox pre-fetches one pinned Chromium build under
        // PLAYWRIGHT_BROWSERS_PATH; @playwright/test's own version can
        // expect a different build number than what's on disk (a
        // "browserType.launch: Executable doesn't exist" failure with
        // "npx playwright install" in the message is that mismatch, not a
        // real missing dependency) — launch the stable symlink directly
        // instead of the version-numbered path Playwright resolves by
        // default. Harmless outside this environment: undefined falls
        // through to Playwright's normal resolution.
        launchOptions: process.env.PLAYWRIGHT_BROWSERS_PATH
          ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
          : {},
      },
    },
  ],
});
