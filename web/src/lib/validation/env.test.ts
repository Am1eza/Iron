/**
 * getServerEnv() is called from instrumentation.ts at real server boot (the
 * intended fail-fast gate for a misconfigured live deploy) — these tests
 * exercise it directly since instrumentation.ts itself has side effects
 * (starting jobs) that don't belong in a unit test. `publicEnv`/the server
 * schema are computed at module-load time from process.env, so each case
 * sets env vars THEN dynamically re-imports the module via vi.resetModules().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_API_MODE',
  'DATABASE_URL',
  'SESSION_SECRET',
  'SMSIR_API_KEY',
  'SMSIR_TEMPLATE_ID',
  'AI_ENABLED',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) original[key] = process.env[key];
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
});

async function loadEnv() {
  vi.resetModules();
  return import('./env');
}

describe('getServerEnv — live mode', () => {
  it('throws when DATABASE_URL/SESSION_SECRET/SMSIR_* are missing', async () => {
    process.env.NEXT_PUBLIC_API_MODE = 'live';
    delete process.env.DATABASE_URL;
    delete process.env.SESSION_SECRET;
    delete process.env.SMSIR_API_KEY;
    delete process.env.SMSIR_TEMPLATE_ID;
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/پیکربندی محیط نامعتبر است/);
  });

  it('passes once DATABASE_URL/SESSION_SECRET/SMSIR_* are all set', async () => {
    process.env.NEXT_PUBLIC_API_MODE = 'live';
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.SMSIR_API_KEY = 'key';
    process.env.SMSIR_TEMPLATE_ID = '123';
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).not.toThrow();
  });

  it('still throws for AI_ENABLED=true without DeepSeek keys, even with the rest set', async () => {
    process.env.NEXT_PUBLIC_API_MODE = 'live';
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.SMSIR_API_KEY = 'key';
    process.env.SMSIR_TEMPLATE_ID = '123';
    process.env.AI_ENABLED = 'true';
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).toThrow(/دستیار هوشمند/);
  });
});

describe('getServerEnv — mock mode', () => {
  it('never throws — every server var is optional when NEXT_PUBLIC_API_MODE is mock (the default)', async () => {
    process.env.NEXT_PUBLIC_API_MODE = 'mock';
    delete process.env.DATABASE_URL;
    delete process.env.SESSION_SECRET;
    delete process.env.SMSIR_API_KEY;
    delete process.env.SMSIR_TEMPLATE_ID;
    const { getServerEnv } = await loadEnv();
    expect(() => getServerEnv()).not.toThrow();
  });
});
