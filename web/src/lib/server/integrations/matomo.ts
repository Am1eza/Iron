/**
 * Matomo Reporting API — the traffic half of the marketing picture (W28).
 *
 * The panel knows everything that happens AFTER someone submits a form (which
 * lead became a proforma, which became a won deal, and for how many toman).
 * It structurally cannot know what happened BEFORE: how many people visited
 * at all, and whether they arrived from search, a direct link or a campaign.
 * Matomo knows exactly that and nothing about the deal. Pulling a handful of
 * its headline numbers in here means the owner reads one screen instead of
 * reconciling two systems by eye.
 *
 * Server-side only, always: `MATOMO_API_TOKEN` grants full read access to the
 * analytics instance and must never reach the browser. The request also stays
 * inside the Docker network (`http://matomo` by default), so it never crosses
 * the public internet and the strict CSP is untouched.
 *
 * Degrades to `null` on every failure path — an unconfigured token, a down
 * container, a slow response. Traffic figures are a nice-to-have next to the
 * revenue numbers; they must never take the page down with them.
 */
import { reportError } from '@/lib/errors/report';
import { cacheGetJson, cacheSetJson } from '@/lib/server/redis';

export interface MatomoSummary {
  visits: number;
  uniqueVisitors: number;
  /** Share of visits that left after one action, 0–100. */
  bounceRatePct: number | null;
  /** Referrer buckets, largest first: direct / search / website / campaign. */
  byReferrerType: Array<{ label: string; visits: number }>;
}

/** Matomo's own period vocabulary for the ranges this dashboard offers. */
function matomoPeriod(days: number): string {
  return `previous${days}`;
}

const TIMEOUT_MS = 4000;

async function call<T>(params: Record<string, string>): Promise<T | null> {
  const base = process.env.MATOMO_INTERNAL_URL ?? 'http://matomo';
  const token = process.env.MATOMO_API_TOKEN;
  const siteId = process.env.MATOMO_SITE_ID;
  if (!token || !siteId) return null; // Not configured — a silent, expected no-op.

  const body = new URLSearchParams({
    module: 'API',
    format: 'JSON',
    idSite: siteId,
    // POST body, not query string: Matomo's own guidance, and it keeps the
    // token out of any intermediate access log.
    token_auth: token,
    ...params,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/index.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    // Matomo answers errors with HTTP 200 and {result:'error', message}.
    if (json && typeof json === 'object' && (json as { result?: string }).result === 'error') {
      reportError(new Error(`matomo: ${(json as { message?: string }).message ?? 'unknown'}`), {
        integration: 'matomo',
        method: params.method,
      });
      return null;
    }
    return json as T;
  } catch (err) {
    // An aborted/failed analytics call must never surface to the admin.
    if (err instanceof Error && err.name !== 'AbortError') {
      reportError(err, { integration: 'matomo', method: params.method });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Matomo aggregates its own reports on a schedule and these figures inform
 *  slow decisions (where to spend next month), so a few minutes of staleness
 *  costs nothing — while an uncached call would hit Matomo on every dashboard
 *  poll from every logged-in staff member. */
const CACHE_TTL_SECONDS = 600;

export async function matomoSummary(days: number): Promise<MatomoSummary | null> {
  const cacheKey = `matomo:summary:${days}`;
  const cached = await cacheGetJson<MatomoSummary>(cacheKey);
  if (cached) return cached;

  const fresh = await fetchMatomoSummary(days);
  if (fresh) await cacheSetJson(cacheKey, fresh, CACHE_TTL_SECONDS);
  return fresh;
}

async function fetchMatomoSummary(days: number): Promise<MatomoSummary | null> {
  const period = matomoPeriod(days);
  const [summary, referrers] = await Promise.all([
    call<{ nb_visits?: number; nb_uniq_visitors?: number; bounce_rate?: string }>({
      method: 'VisitsSummary.get',
      period: 'range',
      date: period,
    }),
    call<Array<{ label?: string; nb_visits?: number }>>({
      method: 'Referrers.getReferrerType',
      period: 'range',
      date: period,
    }),
  ]);
  if (!summary) return null;

  // Matomo returns bounce rate as a "42%" string.
  const bounce = summary.bounce_rate ? Number(String(summary.bounce_rate).replace('%', '')) : NaN;

  return {
    visits: Number(summary.nb_visits ?? 0),
    uniqueVisitors: Number(summary.nb_uniq_visitors ?? 0),
    bounceRatePct: Number.isFinite(bounce) ? bounce : null,
    byReferrerType: Array.isArray(referrers)
      ? referrers
          .map((r) => ({ label: String(r.label ?? ''), visits: Number(r.nb_visits ?? 0) }))
          .filter((r) => r.label && r.visits > 0)
          .sort((a, b) => b.visits - a.visits)
      : [],
  };
}
