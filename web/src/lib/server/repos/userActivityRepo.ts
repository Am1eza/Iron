/** Cross-domain per-user activity snapshots for the admin user-detail tab
 *  (US-21.3) — not a single table's repo, so it doesn't belong under any one
 *  domain repo (leads/orders already have their own ForUser functions this
 *  reuses directly). */
import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiConversations, aiUsage } from '@/lib/server/db/schema';

export interface UserAiUsageSummary {
  conversationCount: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

/** This user's AI-advisor usage — conversation count + summed token
 *  telemetry across them. `aiUsage.conversationId` carries no FK (a
 *  deliberately loose column, see its schema comment), so this joins in two
 *  steps: this user's conversation ids, then usage rows for those ids. */
export async function aiUsageSummaryForUser(userId: string): Promise<UserAiUsageSummary> {
  const db = getDb();
  const convs = await db.select({ id: aiConversations.id }).from(aiConversations).where(eq(aiConversations.userId, userId));
  const ids = convs.map((c) => c.id);
  if (ids.length === 0) {
    return { conversationCount: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };
  }
  const rows = await db
    .select({
      promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
      completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
      cacheHitTokens: sql<number>`coalesce(sum(${aiUsage.cacheHitTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(inArray(aiUsage.conversationId, ids));
  const sums = rows[0] ?? { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };
  return { conversationCount: ids.length, ...sums };
}
