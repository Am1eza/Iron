/**
 * Google Search Console orchestration (US-14.4) — the layer between the
 * route handlers / refresh job and the two things that actually do work
 * (`integrations/searchConsole.ts` for Google, `repos/searchConsoleRepo.ts`
 * for storage).
 *
 * ── This is live code behind a disabled switch ────────────────────────────
 * Nothing here has ever run against the real API, because creating the OAuth
 * client requires a human with the Google Cloud project and the verified
 * ahantime.com property. So the contract is: with `GSC_*` unset, every
 * entry point returns a clear "not configured" instead of throwing, the job
 * no-ops, and no UI appears. Nothing fabricates a number, and nothing is
 * cached that was not returned by Google.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, hasDb } from '@/lib/server/db/client';
import { articles } from '@/lib/server/db/schema';
import { routes } from '@/lib/routes';
import { reportError } from '@/lib/errors/report';
import { CircuitOpenError } from '@/lib/server/utils/resilience';
import {
  SearchConsoleHttpError,
  buildAuthUrl,
  exchangeCode,
  fetchTopQueriesForPage,
  refreshAccessToken,
  revokeToken,
} from '@/lib/server/integrations/searchConsole';
import { gscSiteUrl, isSearchConsoleConfigured } from '@/lib/server/integrations/searchConsoleConfig';
import {
  beginOAuth,
  clearGrant,
  consumeOAuthState,
  deleteMetricsForPathsNotIn,
  getAuthRow,
  getPathMetrics,
  recordSyncError,
  recordSyncSuccess,
  replacePathMetrics,
  saveAccessToken,
  saveGrant,
  type SearchConsoleMetricRow,
} from '@/lib/server/repos/searchConsoleRepo';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

/**
 * Search Console's data lags ~2–3 days and `dataState: 'final'` only returns
 * settled rows, so a window that ends today is mostly empty. 28 days ending
 * three days ago is the same window the Search Console UI's default
 * "last 28 days" effectively shows.
 */
export const WINDOW_DAYS = 28;
export const LAG_DAYS = 3;

/** `YYYY-MM-DD` in UTC — Google wants a plain date, and deriving it from the
 *  server's local timezone would shift the window by a day for half of it. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ReportingWindow {
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
}

/**
 * Search Analytics treats `startDate` and `endDate` as INCLUSIVE, so the span
 * is `WINDOW_DAYS` and the start is `WINDOW_DAYS - 1` days before the end —
 * subtracting a full 28 gave 29 days of data under a constant that says 28.
 */
export function reportingWindow(now: Date = new Date()): ReportingWindow {
  const end = new Date(now.getTime() - LAG_DAYS * 86_400_000);
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * 86_400_000);
  return { startDate: isoDate(start), endDate: isoDate(end), start, end };
}

/**
 * Site-relative path → the absolute, percent-encoded URL Search Console
 * reports pages under.
 *
 * The base is the PROPERTY (`GSC_SITE_URL`) whenever it is a URL-prefix one,
 * falling back to the site's own origin for a `sc-domain:` property (which
 * carries no scheme or host to build on). Using `NEXT_PUBLIC_SITE_URL`
 * unconditionally — what this did first — meant that a property verified as
 * `https://www.ahantime.com/` while the app advertises `https://ahantime.com`
 * matched zero rows on every single page, and the run still recorded SUCCESS:
 * "connected, synced a minute ago, no queries" is indistinguishable from a
 * site nobody has found yet.
 *
 * Persian slugs arrive ALREADY percent-encoded (`routes.blog()` runs
 * `encodeURIComponent` on the slug), which is also how Search Console reports
 * them, and `new URL()` does not double-encode an existing `%XX`. Both the
 * job and the editor build their path through `routes.*`, so the cache key on
 * each side is the same string.
 */
export function absolutePageUrl(path: string): string {
  const property = gscSiteUrl();
  const base = property && /^https?:\/\//i.test(property) ? property : SITE_URL;
  return new URL(path, base).toString();
}

/* -------------------------------- status -------------------------------- */

export interface SearchConsoleStatus {
  /** Are the env credentials present at all? */
  configured: boolean;
  /** Has someone completed the OAuth consent? */
  connected: boolean;
  siteUrl: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** True when `GSC_SITE_URL` no longer matches the property the stored grant
   *  was issued for — otherwise this looks like a permissions failure. */
  siteUrlMismatch: boolean;
}

export async function searchConsoleStatus(): Promise<SearchConsoleStatus> {
  const configured = isSearchConsoleConfigured();
  const envSite = gscSiteUrl() ?? null;
  if (!configured || !hasDb()) {
    return {
      configured,
      connected: false,
      siteUrl: envSite,
      lastSyncAt: null,
      lastError: null,
      siteUrlMismatch: false,
    };
  }
  const row = await getAuthRow();
  const connected = Boolean(row?.refreshToken);
  return {
    configured,
    connected,
    siteUrl: row?.siteUrl ?? envSite,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    siteUrlMismatch: connected && Boolean(row?.siteUrl) && Boolean(envSite) && row?.siteUrl !== envSite,
  };
}

/* -------------------------------- connect -------------------------------- */

export class SearchConsoleNotConfiguredError extends Error {
  constructor() {
    super('Search Console credentials are not configured');
    this.name = 'SearchConsoleNotConfiguredError';
  }
}

/** Mint a nonce, remember it, and hand back the Google consent URL. */
export async function startConnect(): Promise<string> {
  if (!isSearchConsoleConfigured()) throw new SearchConsoleNotConfiguredError();
  const state = randomUUID();
  await beginOAuth(state);
  return buildAuthUrl(state);
}

export type ConnectResult = { ok: true } | { ok: false; reason: 'state' | 'exchange' | 'no_refresh_token' };

/**
 * Finish the consent redirect.
 *
 * The `state` check happens FIRST and consumes the nonce either way, so a
 * forged callback cannot bind an attacker's Google account to this
 * installation, and a genuine one cannot be replayed.
 */
export async function finishConnect(code: string, state: string): Promise<ConnectResult> {
  if (!isSearchConsoleConfigured()) throw new SearchConsoleNotConfiguredError();
  const stateOk = await consumeOAuthState(state);
  if (!stateOk) return { ok: false, reason: 'state' };

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (err) {
    reportError(err, { stage: 'searchConsole.finishConnect' });
    return { ok: false, reason: 'exchange' };
  }
  if (!tokens.refreshToken) {
    // Without a refresh token the connection dies in an hour. `prompt=consent`
    // is supposed to guarantee one; if Google ever doesn't send it, saying so
    // beats storing a grant that will fail tomorrow for no visible reason.
    return { ok: false, reason: 'no_refresh_token' };
  }

  await saveGrant({
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.expiresAt,
    siteUrl: gscSiteUrl()!,
  });
  return { ok: true };
}

export async function disconnect(): Promise<void> {
  const refreshToken = await clearGrant();
  if (!refreshToken) return;
  try {
    await revokeToken(refreshToken);
  } catch (err) {
    // Our copy is already gone, which is what the admin asked for. A failed
    // revoke is worth reporting, not worth failing the request over.
    reportError(err, { stage: 'searchConsole.revoke' });
  }
}

/* --------------------------------- data --------------------------------- */

/** A valid access token, refreshing it if the cached one has expired.
 *  Returns null when there is no grant at all. */
async function currentAccessToken(): Promise<string | null> {
  const row = await getAuthRow();
  if (!row?.refreshToken) return null;
  if (row.accessToken && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() > Date.now()) {
    return row.accessToken;
  }
  const tokens = await refreshAccessToken(row.refreshToken);
  await saveAccessToken(tokens.accessToken, tokens.expiresAt);
  return tokens.accessToken;
}

export type RefreshOutcome =
  | { ok: true; rows: number }
  | { ok: false; reason: 'not_configured' | 'not_connected' | 'auth_failed' | 'unavailable' | 'error' };

/**
 * Pull one page's top queries and replace its cache.
 *
 * Every failure mode is a returned value, never a throw: this is called from
 * a background job over many paths and from a route the editor hits, and in
 * both cases one bad page must not take the caller down with it.
 *
 * `window` is passed in by the job so every path in one run shares a single
 * reporting period — computed per path, a run that crosses midnight UTC left
 * different `period_start`/`period_end` on different articles, and the panel
 * reports the period from one row.
 */
export async function refreshPathMetrics(path: string, window: ReportingWindow = reportingWindow()): Promise<RefreshOutcome> {
  if (!isSearchConsoleConfigured()) return { ok: false, reason: 'not_configured' };
  const siteUrl = gscSiteUrl()!;
  try {
    const accessToken = await currentAccessToken();
    if (!accessToken) return { ok: false, reason: 'not_connected' };
    const rows = await fetchTopQueriesForPage({
      accessToken,
      siteUrl,
      startDate: window.startDate,
      endDate: window.endDate,
      pageUrl: absolutePageUrl(path),
    });
    await replacePathMetrics(path, rows, { start: window.start, end: window.end });
    await recordSyncSuccess();
    return { ok: true, rows: rows.length };
  } catch (err) {
    // The breaker is already open, i.e. this call never left the process.
    // Reporting it per path would file one event and one DB write for every
    // remaining article in the run, all describing the same outage.
    if (err instanceof CircuitOpenError) return { ok: false, reason: 'unavailable' };
    reportError(err, { stage: 'searchConsole.refreshPathMetrics', path });
    if (err instanceof SearchConsoleHttpError && err.isGrantFailure) {
      await recordSyncError(
        'دسترسی گوگل رد شد. احتمالاً اتصال باطل شده یا نشانی property با تنظیمات نمی‌خواند — دوباره متصل شوید.',
      );
      return { ok: false, reason: 'auth_failed' };
    }
    await recordSyncError('دریافت داده از سرچ کنسول ناموفق بود.');
    return { ok: false, reason: 'error' };
  }
}

export interface ArticleSearchMetrics {
  path: string;
  rows: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  periodStart: string | null;
  periodEnd: string | null;
  fetchedAt: string | null;
}

/** Whatever is cached for a path. Never calls Google — the editor opens this
 *  on every article and a multi-second API round trip per open is exactly
 *  what the cache table exists to avoid. */
export async function cachedMetricsForPath(path: string): Promise<ArticleSearchMetrics> {
  const rows: SearchConsoleMetricRow[] = await getPathMetrics(path);
  return {
    path,
    rows: rows.map((r) => ({
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    periodStart: rows[0]?.periodStart?.toISOString() ?? null,
    periodEnd: rows[0]?.periodEnd?.toISOString() ?? null,
    fetchedAt: rows[0]?.fetchedAt?.toISOString() ?? null,
  };
}

/** Published articles only — a draft has no public URL and therefore no
 *  Search Console data, and asking for it burns quota per run. */
export async function publishedArticlePaths(): Promise<string[]> {
  const rows = await getDb()
    .select({ slug: articles.slug, type: articles.type })
    .from(articles)
    .where(eq(articles.status, 'published'));
  return rows.map((r) => (r.type === 'news' ? routes.news(r.slug) : routes.blog(r.slug)));
}

/**
 * The job body: refresh every published article, sequentially.
 *
 * Sequential on purpose. Search Console's per-minute quota is generous but
 * finite, and a burst of parallel requests is the one shape that trips it;
 * this runs daily in the background, so wall-clock is irrelevant. It also
 * stops at the first authentication failure — with a broken grant, every
 * remaining request would fail identically and only fill the error tracker.
 */
export async function refreshAllPublishedArticles(): Promise<{ paths: number; refreshed: number }> {
  if (!isSearchConsoleConfigured() || !hasDb()) return { paths: 0, refreshed: 0 };
  const status = await searchConsoleStatus();
  if (!status.connected) return { paths: 0, refreshed: 0 };

  const paths = await publishedArticlePaths();
  // ONE window for the whole run, so every path's cached rows describe the
  // same period even if the run crosses midnight UTC.
  const window = reportingWindow();
  let refreshed = 0;
  for (const path of paths) {
    const outcome = await refreshPathMetrics(path, window);
    if (outcome.ok) {
      refreshed += 1;
      continue;
    }
    // Every one of these fails identically for every remaining path: a dead
    // grant, no grant, or a circuit the resilience layer has already opened.
    // Continuing would only fill the error tracker and re-write `lastError`
    // once per article.
    if (outcome.reason === 'auth_failed' || outcome.reason === 'not_connected' || outcome.reason === 'unavailable') {
      break;
    }
  }
  // An article that was unpublished or deleted keeps its cached rows forever
  // otherwise, and they would resurface if the URL were ever reused.
  await deleteMetricsForPathsNotIn(paths);
  return { paths: paths.length, refreshed };
}
