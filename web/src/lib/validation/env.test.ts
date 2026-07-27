/**
 * getServerEnv() is called from instrumentation.ts at real server boot (the
 * intended fail-fast gate for a misconfigured live deploy) — these tests
 * exercise it directly since instrumentation.ts itself has side effects
 * (starting jobs) that don't belong in a unit test. `publicEnv`/the server
 * schema are computed at module-load time from process.env, so each case
 * sets env vars (via vi.stubEnv — NODE_ENV is read-only on process.env
 * itself) THEN dynamically re-imports the module via vi.resetModules().
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadEnv() {
  vi.resetModules();
  return import('./env');
}

describe('getServerEnv — live mode', () => {
  it('throws when DATABASE_URL/SESSION_SECRET are missing, regardless of NODE_ENV', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SESSION_SECRET', '');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/پیکربندی محیط نامعتبر است/);
  });

  it('boots fine in development without SMSIR_* — OTP has a real dev-log fallback (sms.ts)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('SMSIR_API_KEY', '');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).not.toThrow();
  });

  it('throws in production without SMSIR_* — OTP login has no fallback once deployed', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('SMSIR_API_KEY', '');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/پیکربندی محیط نامعتبر است/);
  });

  it('passes in production once DATABASE_URL/SESSION_SECRET/SMSIR_* are all set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('SMSIR_API_KEY', 'key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '123');
    vi.stubEnv('SMSIR_LINE_NUMBER', '30002108024652');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).not.toThrow();
  });

  it('throws in production when only SMSIR_LINE_NUMBER is missing', async () => {
    // The regression this guards: the line number used to be optional in
    // production, so the app booted happily with OTP working (verify endpoint
    // needs no line) and EVERY free-text send — proformas, order
    // confirmations, alerts — dead. That outage ran for weeks unnoticed.
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('SMSIR_API_KEY', 'key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '123');
    vi.stubEnv('SMSIR_LINE_NUMBER', '');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/پیکربندی محیط نامعتبر است/);
  });

  it('still throws for AI_ENABLED=true without DeepSeek keys, even with the rest set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('SMSIR_API_KEY', 'key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '123');
    vi.stubEnv('SMSIR_LINE_NUMBER', '30002108024652');
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('DEEPSEEK_BASE_URL', '');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/دستیار هوشمند/);
  });
});

describe('getServerEnv — mock mode', () => {
  it('never throws — every server var is optional when NEXT_PUBLIC_API_MODE is mock (the default)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SESSION_SECRET', '');
    vi.stubEnv('SMSIR_API_KEY', '');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).not.toThrow();
  });
});
