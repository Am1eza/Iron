// @vitest-environment node
/**
 * F-131 — the Postgres-backed fixed-window fallback used when Redis is
 * unreachable. Correctness of the single atomic upsert; the actual
 * multi-worker race proof (two real OS processes against real Postgres) is
 * scripts/rateLimitOutageProbe.ts, since pglite is single-process and cannot
 * demonstrate cross-process concurrency — see CLAUDE.md's rule against
 * pglite-only proof for concurrency claims.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from '@/test/db';
import { setDbForTesting, type Db } from '@/lib/server/db/client';
import { dbRateCheck } from './dbRateLimit';

let close: () => Promise<void>;
let testDb: Db;

beforeAll(async () => {
  ({ close, db: testDb } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe('dbRateCheck', () => {
  it('allows up to the limit, then reports over-limit for the same window', async () => {
    const key = `otp-request:probe-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(await dbRateCheck(key, 3, 60_000)).toBe(false);
    }
    expect(await dbRateCheck(key, 3, 60_000)).toBe(true);
    expect(await dbRateCheck(key, 3, 60_000)).toBe(true);
  });

  it('keeps independent counters per key', async () => {
    const a = `otp-request:a-${Math.random()}`;
    const b = `otp-request:b-${Math.random()}`;
    expect(await dbRateCheck(a, 1, 60_000)).toBe(false);
    expect(await dbRateCheck(a, 1, 60_000)).toBe(true);
    // b's own window is untouched by a's count.
    expect(await dbRateCheck(b, 1, 60_000)).toBe(false);
  });

  it('starts a fresh window once the bucket boundary moves past', async () => {
    const key = `otp-request:window-${Math.random()}`;
    // A 1ms window means the very next call falls in a new bucket.
    expect(await dbRateCheck(key, 1, 1)).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(await dbRateCheck(key, 1, 1)).toBe(false);
  });

  it('returns null (defer to caller fallback) when there is no database', async () => {
    setDbForTesting(null);
    // hasDb() also falls back to `Boolean(process.env.DATABASE_URL)` when no
    // override/global db is set (so a real request outside tests can still
    // find the pool) — a real DATABASE_URL happening to be set in this shell
    // (e.g. when this file runs against a real disposable Postgres instead
    // of pglite) would otherwise make hasDb() true regardless of the line
    // above, silently turning this into the wrong test.
    vi.stubEnv('DATABASE_URL', '');
    try {
      expect(await dbRateCheck(`otp-request:no-db-${Math.random()}`, 1, 60_000)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      // Restore the SAME pglite instance for subsequent tests / afterAll's
      // close() — creating a second instance here would leak the first.
      setDbForTesting(testDb);
    }
  });
});
