import { NextResponse, type NextRequest } from 'next/server';
import { sql, eq, and, gte } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { currentPrices, leads, userRequests, orders, contactMessages, users, articles, aiUsage } from '@/lib/server/db/schema';

/** GET /api/admin/stats — the dashboard tiles. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'admin:access');
  if ('response' in auth) return auth.response;

  const db = getDb();
  const count = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [stalePrices, freshPrices, newLeads, openRequests, activeOrders, newMessages, totalUsers, newUsers24h, draftArticles, aiRow] =
    await Promise.all([
      count(db.select({ n: sql<number>`count(*)::int` }).from(currentPrices).where(eq(currentPrices.isStale, true))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(currentPrices).where(eq(currentPrices.isStale, false))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.status, 'new'))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(userRequests).where(eq(userRequests.status, 'submitted'))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(orders).where(sql`${orders.status} != 'delivered'`)),
      count(db.select({ n: sql<number>`count(*)::int` }).from(contactMessages).where(eq(contactMessages.status, 'new'))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(users)),
      count(db.select({ n: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, dayAgo))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(articles).where(and(eq(articles.status, 'draft')))),
      // AI cost today — token sums + validator violations since local midnight.
      db
        .select({
          promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
          completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
          cacheHitTokens: sql<number>`coalesce(sum(${aiUsage.cacheHitTokens}), 0)::int`,
          violations: sql<number>`coalesce(sum(${aiUsage.violations}), 0)::int`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, dayStart))
        .then((r) => r[0]),
    ]);

  const ai = aiRow ?? { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, violations: 0 };
  const aiToday = {
    promptTokens: ai.promptTokens,
    completionTokens: ai.completionTokens,
    cacheHitRate: ai.promptTokens > 0 ? Math.round((ai.cacheHitTokens / ai.promptTokens) * 100) / 100 : 0,
    violations: ai.violations,
  };

  return NextResponse.json(
    { stats: { stalePrices, freshPrices, newLeads, openRequests, activeOrders, newMessages, totalUsers, newUsers24h, draftArticles, aiToday } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
