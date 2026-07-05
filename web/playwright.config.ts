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
  // A route Playwright hasn't hit yet in this run costs `next dev`'s
  // on-demand compile the first time (measured directly: ~4.5s for
  // /prices/rebar cold vs ~0.2s once compiled) — that plus the real Postgres
  // round-trip can outrun a tight assertion timeout on the very first visit.
  // A prebuilt/production server wouldn't have this tax; bumped both
  // budgets rather than the previous 30s/8s, which were tuned for an
  // already-warm dev server.
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // One retry in CI only — standard cushion for an e2e suite driving a
  // dev server on shared CI CPU (cold compiles, GC pauses). NOT masking a
  // known failure: the earlier "flakiness" was a real CSP hydration bug,
  // now fixed; these specs pass deterministically.
  retries: process.env.CI ? 1 : 0,
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
      // Surface the DB + dev-server logs in the Playwright output (and thus
      // in CI job logs). Off by default in Playwright, which is why an
      // earlier CI failure showed only client-side timeouts with no trace of
      // the server-side "Cannot use a pool"/"Failed query" errors that were
      // the real cause — making a DB race invisible in CI.
      stdout: 'pipe',
      stderr: 'pipe',
      env: { E2E_DB_PORT: String(DB_PORT) },
    },
    {
      command: `next dev -p ${APP_PORT}`,
      url: `${BASE_URL}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
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
        // See rateLimit.ts — the suite's login volume (multiple specs plus
        // toPass retries) legitimately exceeds otp-request's production cap.
        DISABLE_RATE_LIMIT_FOR_TESTS: 'true',
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
