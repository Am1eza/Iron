/** AI usage telemetry aggregates — daily series for the admin cost/usage
 *  console (US-24.3). Raw token counts only; this app has no sourced
 *  DeepSeek Toman/USD rate anywhere, so a "cost" figure would be a made-up
 *  number dressed as fact — tokens are the real, verifiable metric. */
import { sql, gte, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiUsage, aiConversations, aiFeedback } from '@/lib/server/db/schema';

export interface AiUsageDay {
  date: string; // YYYY-MM-DD, local server day
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  violations: number;
}

export async function aiUsageDailySeries(days = 14): Promise<AiUsageDay[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const rows = await getDb()
    .select({
      day: sql<string>`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`,
      promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
      completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
      cacheHitTokens: sql<number>`coalesce(sum(${aiUsage.cacheHitTokens}), 0)::int`,
      violations: sql<number>`coalesce(sum(${aiUsage.violations}), 0)::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since))
    .groupBy(sql`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`);

  // Zero-fill missing days — a quiet day (or the AI advisor being disabled)
  // must show as a real 0, not silently vanish from the series and skew the
  // x-axis spacing of every day after it.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: AiUsageDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const r = byDay.get(key);
    out.push({
      date: key,
      promptTokens: r?.promptTokens ?? 0,
      completionTokens: r?.completionTokens ?? 0,
      cacheHitTokens: r?.cacheHitTokens ?? 0,
      violations: r?.violations ?? 0,
    });
  }
  return out;
}

export interface PromptVersionMetrics {
  versionId: string;
  conversationCount: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  feedbackUp: number;
  feedbackDown: number;
}

/**
 * Per-version A/B comparison (US-05.5, AC2) — feedback rate, token usage,
 * cache-hit ratio, grouped by aiConversations.promptVersionId. Two separate
 * grouped queries (usage, feedback) merged in JS rather than one JOIN: both
 * ai_usage and ai_feedback are one-to-many off a conversation, so joining
 * them together in a single query would fan-out and double-count sums.
 */
export async function promptVersionMetrics(): Promise<PromptVersionMetrics[]> {
  const db = getDb();
  const [usageRows, feedbackRows, countRows] = await Promise.all([
    db
      .select({
        versionId: aiConversations.promptVersionId,
        promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
        cacheHitTokens: sql<number>`coalesce(sum(${aiUsage.cacheHitTokens}), 0)::int`,
      })
      .from(aiConversations)
      .innerJoin(aiUsage, eq(aiUsage.conversationId, aiConversations.id))
      .where(isNotNull(aiConversations.promptVersionId))
      .groupBy(aiConversations.promptVersionId),
    db
      .select({
        versionId: aiConversations.promptVersionId,
        rating: aiFeedback.rating,
        n: sql<number>`count(*)::int`,
      })
      .from(aiConversations)
      .innerJoin(aiFeedback, eq(aiFeedback.conversationId, aiConversations.id))
      .where(isNotNull(aiConversations.promptVersionId))
      .groupBy(aiConversations.promptVersionId, aiFeedback.rating),
    db
      .select({ versionId: aiConversations.promptVersionId, n: sql<number>`count(*)::int` })
      .from(aiConversations)
      .where(isNotNull(aiConversations.promptVersionId))
      .groupBy(aiConversations.promptVersionId),
  ]);

  const byVersion = new Map<string, PromptVersionMetrics>();
  const get = (versionId: string) => {
    let m = byVersion.get(versionId);
    if (!m) {
      m = { versionId, conversationCount: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, feedbackUp: 0, feedbackDown: 0 };
      byVersion.set(versionId, m);
    }
    return m;
  };
  for (const r of countRows) if (r.versionId) get(r.versionId).conversationCount = r.n;
  for (const r of usageRows) {
    if (!r.versionId) continue;
    const m = get(r.versionId);
    m.promptTokens = r.promptTokens;
    m.completionTokens = r.completionTokens;
    m.cacheHitTokens = r.cacheHitTokens;
  }
  for (const r of feedbackRows) {
    if (!r.versionId) continue;
    const m = get(r.versionId);
    if (r.rating === 'up') m.feedbackUp = r.n;
    else if (r.rating === 'down') m.feedbackDown = r.n;
  }
  return [...byVersion.values()];
}
