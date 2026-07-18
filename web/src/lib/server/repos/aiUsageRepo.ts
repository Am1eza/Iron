/** AI usage telemetry aggregates — daily series for the admin cost/usage
 *  console (US-24.3). Raw token counts only; this app has no sourced
 *  DeepSeek Toman/USD rate anywhere, so a "cost" figure would be a made-up
 *  number dressed as fact — tokens are the real, verifiable metric. */
import { sql, gte } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiUsage } from '@/lib/server/db/schema';

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
