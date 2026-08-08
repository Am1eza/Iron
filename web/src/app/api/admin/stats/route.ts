import { NextResponse, type NextRequest } from 'next/server';
import { sql, eq, and, gte, isNull } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { can } from '@/lib/auth/roles';
import type { Permission } from '@/lib/auth/types';
import { getDb } from '@/lib/server/db/client';
import { currentPrices, leads, userRequests, orders, contactMessages, users, articles, aiUsage } from '@/lib/server/db/schema';
import { triggeredAlertCount } from '@/lib/server/repos/alertsRepo';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';

/**
 * GET /api/admin/stats — the dashboard tiles. Each field is behind its own
 * domain permission so a scoped role (e.g. content editor) only ever sees the
 * numbers it's allowed to act on; unauthorized fields are simply omitted.
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'admin:access');
  if ('response' in auth) return auth.response;

  const role = auth.session.role;
  const db = getDb();
  const count = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const stats: Record<string, unknown> = {};
  const jobs: Promise<void>[] = [];
  const add = <T>(key: string, permission: Permission, query: () => Promise<T>) => {
    if (!can(role, permission)) return;
    jobs.push(query().then((v) => { stats[key] = v; }));
  };

  // W23 review fix: this used to count the PERSISTED `isStale` column,
  // refreshed only every 10 minutes by the staleness cron job. The pricing
  // grid's own "فقط کهنه‌ها" filter (and the nav badge/dashboard tile this
  // number feeds, which deep-links straight into that filter via
  // `?stale=1`) both need to show the SAME number — computed live via
  // `getPriceFreshness()`, the single source of truth every other
  // price-reading path in the app already uses, so an operator never lands
  // on a filtered grid whose count doesn't match what sent them there.
  add('stalePrices', 'pricing:write', async () => {
    const freshness = await getPriceFreshness();
    const rows = await db.select({ updatedAt: currentPrices.updatedAt }).from(currentPrices);
    return rows.filter((r) => freshness.isStale(r.updatedAt)).length;
  });
  add('freshPrices', 'pricing:write', async () => {
    const freshness = await getPriceFreshness();
    const rows = await db.select({ updatedAt: currentPrices.updatedAt }).from(currentPrices);
    return rows.filter((r) => !freshness.isStale(r.updatedAt)).length;
  });
  add('newLeads', 'leads:read', () =>
    count(db.select({ n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.status, 'new'))));
  add('openRequests', 'leads:read', () =>
    count(db.select({ n: sql<number>`count(*)::int` }).from(userRequests).where(eq(userRequests.status, 'submitted'))));
  // audit-2026-08-08: a cancelled order (`deletedAt` set, per W17 — see
  // account.ts's identical fix) keeps whatever status it last had rather than
  // stepping to a terminal one, so "status != delivered" alone counted every
  // cancelled order as active forever. This tile never converged toward
  // zero on a store with real cancellations.
  add('activeOrders', 'leads:read', () =>
    count(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(sql`${orders.status} != 'delivered'`, isNull(orders.deletedAt))),
    ));
  add('newMessages', 'leads:read', () =>
    count(db.select({ n: sql<number>`count(*)::int` }).from(contactMessages).where(eq(contactMessages.status, 'new'))));
  add('totalUsers', 'users:manage', () =>
    count(db.select({ n: sql<number>`count(*)::int` }).from(users)));
  add('newUsers24h', 'users:manage', () =>
    count(db.select({ n: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, dayAgo))));
  // KYC/KYB queue depth — a real daily work queue that was invisible from the
  // dashboard (only discoverable by scrolling the users page).
  add('pendingVerifications', 'users:manage', () =>
    count(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.idVerifyStatus} = 'pending' or ${users.bizVerifyStatus} = 'pending'`),
    ));
  add('draftArticles', 'content:write', () =>
    count(db.select({ n: sql<number>`count(*)::int` }).from(articles).where(and(eq(articles.status, 'draft')))));
  // Triggered-but-unreviewed price alerts (قیمت‌سنج, W22) — same permission
  // as the admin alerts page itself, so this only ever appears for the roles
  // that can actually act on it.
  add('triggeredAlerts', 'pricing:write', () => triggeredAlertCount());
  add('aiToday', 'ai:review', () =>
    db
      .select({
        promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
        cacheHitTokens: sql<number>`coalesce(sum(${aiUsage.cacheHitTokens}), 0)::int`,
        violations: sql<number>`coalesce(sum(${aiUsage.violations}), 0)::int`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, dayStart))
      .then((r) => {
        const ai = r[0] ?? { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, violations: 0 };
        return {
          promptTokens: ai.promptTokens,
          completionTokens: ai.completionTokens,
          cacheHitRate: ai.promptTokens > 0 ? Math.round((ai.cacheHitTokens / ai.promptTokens) * 100) / 100 : 0,
          violations: ai.violations,
        };
      }));

  await Promise.all(jobs);

  return NextResponse.json({ stats }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
