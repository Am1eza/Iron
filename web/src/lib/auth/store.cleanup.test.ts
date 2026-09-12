// @vitest-environment node
/**
 * F-147 — `cleanupExpired` batches its DELETEs instead of one unbounded
 * statement per table (so a huge backlog can't hold a single long-running
 * lock). This is meant to be behavior-preserving: same rows deleted, same
 * rows kept — only the number of rows touched per SQL statement changes.
 * These tests prove that against a real (in-process) Postgres, including a
 * backlog bigger than one batch, so the loop actually has to run more than
 * once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { refreshTokens, otpCodes, otpRateLimits } from '@/lib/server/db/schema';
import { eq, lt } from 'drizzle-orm';
import { cleanupExpiredAuth, createUser } from './store';

// Mirrors CLEANUP_BATCH_SIZE in store.pg.ts. Not imported (that constant is a
// private implementation detail) — kept in sync by this comment; if the loop
// ever stops fully clearing a backlog this size, that's the signal to check
// this number still matches.
const CLEANUP_BATCH_SIZE = 5000;

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe('cleanupExpired batching (F-147)', () => {
  it('fully clears an expired backlog bigger than one batch, in both otp_codes and refresh_tokens', async () => {
    const db = getDb();
    const user = await createUser({ mobile: '09135009001' });
    const now = Date.now();
    const expired = now - 60_000;
    const future = now + 60_000;

    const backlogSize = CLEANUP_BATCH_SIZE + 3; // forces the loop around twice
    await db.insert(otpCodes).values(
      Array.from({ length: backlogSize }, (_, i) => ({
        mobile: `09-otp-backlog-${i}`,
        codeHash: 'x',
        expiresAt: expired,
      })),
    );
    await db.insert(refreshTokens).values(
      Array.from({ length: backlogSize }, (_, i) => ({
        tokenHash: `backlog-token-${i}`,
        userId: user.id,
        expiresAt: expired,
      })),
    );
    // One live row in each table that must survive the sweep.
    await db.insert(otpCodes).values({ mobile: '09-otp-alive', codeHash: 'x', expiresAt: future });
    await db.insert(refreshTokens).values({ tokenHash: 'alive-token', userId: user.id, expiresAt: future });

    await cleanupExpiredAuth();

    const remainingOtp = await db.select().from(otpCodes).where(lt(otpCodes.expiresAt, now));
    const remainingRefresh = await db.select().from(refreshTokens).where(lt(refreshTokens.expiresAt, now));
    expect(remainingOtp).toHaveLength(0);
    expect(remainingRefresh).toHaveLength(0);

    expect(await db.select().from(otpCodes).where(eq(otpCodes.mobile, '09-otp-alive'))).toHaveLength(1);
    expect(await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, 'alive-token'))).toHaveLength(1);
  }, 30_000);

  it('still deletes a locked-and-stale otp_rate_limits row, and still keeps one with a recent send', async () => {
    const db = getDb();
    const now = Date.now();

    // Locked in the past, no sends in the last hour: must be deleted.
    await db.insert(otpRateLimits).values({
      mobile: '09-rate-stale',
      sends: [now - 2 * 60 * 60 * 1000],
      lockedUntil: now - 1000,
    });
    // Not locked, but a send within the last hour: must survive.
    await db.insert(otpRateLimits).values({
      mobile: '09-rate-active',
      sends: [now - 5 * 60 * 1000],
      lockedUntil: null,
    });

    await cleanupExpiredAuth();

    expect(await db.select().from(otpRateLimits).where(eq(otpRateLimits.mobile, '09-rate-stale'))).toHaveLength(0);
    expect(await db.select().from(otpRateLimits).where(eq(otpRateLimits.mobile, '09-rate-active'))).toHaveLength(1);
  });
});
