/**
 * getServerEnv() is called from instrumentation.ts at real server boot (the
 * intended fail-fast gate for a misconfigured live deploy) — these tests
 * exercise it directly since instrumentation.ts itself has side effects
 * (starting jobs) that don't belong in a unit test. `publicEnv`/the server
 * schema are computed at module-load time from process.env, so each case
 * sets env vars (via vi.stubEnv — NODE_ENV is read-only on process.env
 * itself) THEN dynamically re-imports the module via vi.resetModules().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => vi.stubEnv('OTP_SECRET', 'o'.repeat(32)));

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

describe('getServerEnv — F-150 SESSION_SECRET rotation schedule', () => {
  it('throws when SESSION_SECRET_PREVIOUS equals SESSION_SECRET (a no-op/accidental "rotation")', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'same-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'same-secret-value');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/SESSION_SECRET_PREVIOUS/);
  });

  it('does not throw when SESSION_SECRET_PREVIOUS genuinely differs from SESSION_SECRET', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'old-secret-value');
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).not.toThrow();
  });

  it('warns when SESSION_SECRET_PREVIOUS is set with no SESSION_SECRET_ROTATED_AT to verify the schedule against', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'old-secret-value');
    vi.stubEnv('SESSION_SECRET_ROTATED_AT', '');
    const { getServerEnv } = await loadEnv();
    getServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/F-150.*SESSION_SECRET_ROTATED_AT is not/));
    warn.mockRestore();
  });

  it('does not warn for a rotation staged well within the safety window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'old-secret-value');
    vi.stubEnv('SESSION_SECRET_ROTATED_AT', String(Date.now() - 24 * 60 * 60 * 1000)); // 1 day ago
    const { getServerEnv } = await loadEnv();
    getServerEnv();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once the rotation has outlived the safety window (one refresh-token lifetime)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'old-secret-value');
    vi.stubEnv('SESSION_SECRET_ROTATED_AT', String(Date.now() - 45 * 24 * 60 * 60 * 1000)); // 45 days ago
    const { getServerEnv } = await loadEnv();
    getServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/F-150.*past the \d+-day safety window/));
    warn.mockRestore();
  });

  it('honours a SHORTER SESSION_SECRET_TTL_DAYS override but never a longer one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'old-secret-value');
    // 10 days old; a 5-day override must flag it even though the 30-day
    // default would not.
    vi.stubEnv('SESSION_SECRET_ROTATED_AT', String(Date.now() - 10 * 24 * 60 * 60 * 1000));
    vi.stubEnv('SESSION_SECRET_TTL_DAYS', '5');
    const { getServerEnv } = await loadEnv();
    getServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/past the 5-day safety window/));
    warn.mockRestore();
  });

  it('ignores an attempt to WIDEN the window past one refresh-token lifetime', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', 'old-secret-value');
    // 45 days old; a 90-day override request must NOT suppress the warning —
    // the cap is min(default, override), never max.
    vi.stubEnv('SESSION_SECRET_ROTATED_AT', String(Date.now() - 45 * 24 * 60 * 60 * 1000));
    vi.stubEnv('SESSION_SECRET_TTL_DAYS', '90');
    const { getServerEnv } = await loadEnv();
    getServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/past the 30-day safety window/));
    warn.mockRestore();
  });

  it('never warns when SESSION_SECRET_PREVIOUS is unset — the common case', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', 'new-secret-value');
    vi.stubEnv('SESSION_SECRET_PREVIOUS', '');
    const { getServerEnv } = await loadEnv();
    getServerEnv();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
