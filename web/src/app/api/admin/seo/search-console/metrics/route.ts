/**
 * Cached Search Console metrics for one page (US-14.4).
 *
 * GET reads the cache only — the editor opens this for every article, and a
 * live Search Analytics call there would put a multi-second Google round trip
 * in front of the drawer. POST is the explicit «به‌روزرسانی» button: one page,
 * on demand, rate-limited, on top of the daily background refresh.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { sitePathSchema } from '@/lib/validation/utils';
import { cachedMetricsForPath, refreshPathMetrics, searchConsoleStatus } from '@/lib/server/services/searchConsole.service';

/**
 * A site-relative path and nothing else — proven by construction, not by a
 * list of prohibitions. See `sitePathSchema` for the backslash hole that
 * motivated it; this value becomes both a cache key and the `page` filter in
 * the body of the outbound Search Analytics request.
 */
const pathSchema = sitePathSchema();

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;

  const parsed = pathSchema.safeParse(req.nextUrl.searchParams.get('path') ?? '');
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_path', message: 'مسیر صفحه معتبر نیست.' }, { status: 400 });
  }
  const full = await searchConsoleStatus();
  // Only what the article panel needs to decide whether to render itself.
  // `siteUrl` is the `GSC_SITE_URL` server config and belongs to the
  // settings-gated view on /admin/seo, not to every content editor.
  const status = { configured: full.configured, connected: full.connected, lastError: full.lastError };
  // Not connected → an empty, honest answer. The panel hides itself on this
  // rather than rendering an empty table that looks like "zero clicks".
  const metrics = full.connected ? await cachedMetricsForPath(parsed.data) : null;
  return NextResponse.json({ status, metrics }, { headers: { 'Cache-Control': 'no-store' } });
}

const refreshPayload = z.object({ path: pathSchema });

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;

  // BEFORE parsing the body: the limit exists to protect Google's per-project
  // quota, and a caller hammering this with malformed bodies should hit the
  // limiter, not walk past it.
  const limited = await rateLimit(req, 'gsc-refresh', { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const v = await validateBody(req, refreshPayload);
  if (!v.ok) return v.response;

  const outcome = await refreshPathMetrics(v.data.path);
  if (!outcome.ok) {
    // 409 is for "your side of this is in the wrong state" (not configured,
    // not connected, grant rejected). A Google outage or timeout is NOT the
    // caller's conflict to resolve, so it answers 502.
    const upstream = outcome.reason === 'error' || outcome.reason === 'unavailable';
    const message =
      outcome.reason === 'not_configured'
        ? 'اتصال به سرچ کنسول هنوز پیکربندی نشده است.'
        : outcome.reason === 'not_connected'
          ? 'هنوز به سرچ کنسول متصل نشده‌اید.'
          : outcome.reason === 'auth_failed'
            ? 'دسترسی گوگل رد شد؛ دوباره متصل شوید.'
            : 'دریافت داده از سرچ کنسول ناموفق بود؛ کمی بعد دوباره تلاش کنید.';
    return NextResponse.json({ error: outcome.reason, message }, { status: upstream ? 502 : 409 });
  }
  const metrics = await cachedMetricsForPath(v.data.path);
  return NextResponse.json({ metrics }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
