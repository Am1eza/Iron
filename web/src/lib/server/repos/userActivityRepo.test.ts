// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { aiUsageSummaryForUser } from './userActivityRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

describe('aiUsageSummaryForUser', () => {
  it('sums token usage across every conversation belonging to the user', async () => {
    const userId = ulid();
    await db.insert(schema.users).values({ id: userId, mobile: '09121230001' });
    const conv1 = ulid();
    const conv2 = ulid();
    await db.insert(schema.aiConversations).values([
      { id: conv1, userId },
      { id: conv2, userId },
    ]);
    await db.insert(schema.aiUsage).values([
      { id: ulid(), conversationId: conv1, promptTokens: 100, completionTokens: 20, cacheHitTokens: 30 },
      { id: ulid(), conversationId: conv1, promptTokens: 50, completionTokens: 10, cacheHitTokens: 0 },
      { id: ulid(), conversationId: conv2, promptTokens: 10, completionTokens: 5, cacheHitTokens: 5 },
    ]);

    const summary = await aiUsageSummaryForUser(userId);
    expect(summary).toEqual({
      conversationCount: 2,
      promptTokens: 160,
      completionTokens: 35,
      cacheHitTokens: 35,
    });
  });

  it('never sums another user\'s conversations', async () => {
    const userId = ulid();
    const otherId = ulid();
    await db.insert(schema.users).values([
      { id: userId, mobile: '09121230002' },
      { id: otherId, mobile: '09121230003' },
    ]);
    const myConv = ulid();
    const theirConv = ulid();
    await db.insert(schema.aiConversations).values([
      { id: myConv, userId },
      { id: theirConv, userId: otherId },
    ]);
    await db.insert(schema.aiUsage).values([
      { id: ulid(), conversationId: myConv, promptTokens: 7, completionTokens: 1, cacheHitTokens: 0 },
      { id: ulid(), conversationId: theirConv, promptTokens: 999, completionTokens: 999, cacheHitTokens: 999 },
    ]);

    const summary = await aiUsageSummaryForUser(userId);
    expect(summary).toEqual({ conversationCount: 1, promptTokens: 7, completionTokens: 1, cacheHitTokens: 0 });
  });

  it('a user with no conversations gets zeros, not an error', async () => {
    const summary = await aiUsageSummaryForUser(ulid());
    expect(summary).toEqual({ conversationCount: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 });
  });
});
