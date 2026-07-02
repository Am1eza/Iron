import { NextResponse, type NextRequest } from 'next/server';
import { sql, eq, and, gte } from 'drizzle-orm';
import { requireApiPermission, requireDb } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { currentPrices, leads, userRequests, orders, contactMessages, users, articles } from '@/lib/server/db/schema';

/** GET /api/admin/stats — the dashboard tiles. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'admin:access');
  if ('response' in auth) return auth.response;

  const db = getDb();
  const count = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [stalePrices, freshPrices, newLeads, openRequests, activeOrders, newMessages, totalUsers, newUsers24h, draftArticles] =
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
    ]);

  return NextResponse.json(
    { stats: { stalePrices, freshPrices, newLeads, openRequests, activeOrders, newMessages, totalUsers, newUsers24h, draftArticles } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
