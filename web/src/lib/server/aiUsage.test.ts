// @vitest-environment node
/**
 * Integration — the ai_usage telemetry table on pglite: one row per AI chat
 * request, aggregated "today" the same way GET /api/admin/stats builds its
 * aiToday block (sum since local midnight, cache-hit rate from the sums).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { gte, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

describe('aiUsage telemetry', () => {
  it('inserts rows and aggregates only today (token sums, violations, cache-hit rate)', async () => {
    await db.insert(schema.aiUsage).values([
      { id: ulid(), conversationId: 'c1', promptTokens: 1000, completionTokens: 200, cacheHitTokens: 600, violations: 1 },
      { id: ulid(), conversationId: null, promptTokens: 500, completionTokens: 100, cacheHitTokens: 150, violations: 0 },
      // Yesterday's row must NOT count toward «امروز».
      {
        id: ulid(),
        conversationId: 'old',
        promptTokens: 9999,
        completionTokens: 9999,
        cacheHitTokens: 9999,
        violations: 9,
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
    ]);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const row = (
      await db
        .select({
          promptTokens: sql<number>`coalesce(sum(${schema.aiUsage.promptTokens}), 0)::int`,
          completionTokens: sql<number>`coalesce(sum(${schema.aiUsage.completionTokens}), 0)::int`,
          cacheHitTokens: sql<number>`coalesce(sum(${schema.aiUsage.cacheHitTokens}), 0)::int`,
          violations: sql<number>`coalesce(sum(${schema.aiUsage.violations}), 0)::int`,
        })
        .from(schema.aiUsage)
        .where(gte(schema.aiUsage.createdAt, dayStart))
    )[0]!;

    expect(row.promptTokens).toBe(1500);
    expect(row.completionTokens).toBe(300);
    expect(row.cacheHitTokens).toBe(750);
    expect(row.violations).toBe(1);
    expect(row.cacheHitTokens / row.promptTokens).toBeCloseTo(0.5, 5);
  });

  it('columns default to 0 so a partial insert still yields a countable row', async () => {
    const id = ulid();
    await db.insert(schema.aiUsage).values({ id });
    const [row] = await db.select().from(schema.aiUsage).where(sql`${schema.aiUsage.id} = ${id}`);
    expect(row).toMatchObject({ promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, violations: 0 });
    expect(row!.createdAt).toBeInstanceOf(Date);
  });
});
