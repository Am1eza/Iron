/**
 * Google Search Console client — OAuth2 (authorization code + refresh) and
 * the one Search Analytics call this app makes (US-14.4).
 *
 * Written against the documented REST endpoints with plain `fetch`, NOT
 * `googleapis`: that package is ~40 MB of generated clients for every Google
 * product, and this integration uses exactly three endpoints. It also pulls
 * `gaxios`/`google-auth-library`, which would land in a Next.js server bundle
 * that currently has no Google dependency at all.
 *
 * Everything here is pure I/O against the config — no database, no session, no
 * caching. Deciding WHEN to refresh a token and WHERE to put the rows is
 * `services/searchConsole.service.ts`'s job; this file just talks to Google.
 *
 * See `searchConsoleConfig.ts` for why the base URLs are overridable and why
 * this ships disabled.
 */
import { z } from 'zod';
import {
  GSC_SCOPE,
  gscApiBaseUrl,
  gscAuthBaseUrl,
  gscClientId,
  gscClientSecret,
  gscRedirectUri,
  gscTokenBaseUrl,
} from './searchConsoleConfig';
import { withResilience } from '@/lib/server/utils/resilience';

const TIMEOUT_MS = 15_000;

/**
 * A Google error carries a status. 401/403 mean "your grant is wrong" —
 * retrying is pointless and, worse, hammers the endpoint with a credential
 * Google has already rejected. 429/5xx are worth another go.
 */
export class SearchConsoleHttpError extends Error {
  constructor(
    public status: number,
    /** Google's response body, truncated. Kept off `message` on purpose (see
     *  below) and never rendered, logged or returned — it exists so a
     *  debugger stepping through has something to look at. */
    public detail: string,
    /** Which endpoint answered. A 400 means completely different things from
     *  the token endpoint (`invalid_grant` — reconnect) and from Search
     *  Analytics (a malformed query — reconnecting fixes nothing). */
    public endpoint: 'token' | 'api' = 'api',
  ) {
    // The message deliberately excludes `detail`: GlitchTip groups by
    // exception value, and Google's error bodies embed request-specific ids
    // that would mint a brand-new issue per occurrence (see the note in
    // resilience.ts about exactly this).
    super(`Search Console HTTP ${status}`);
    this.name = 'SearchConsoleHttpError';
  }
  /**
   * The GRANT is broken — the owner has to reconnect; a retry cannot help.
   *
   * 400 counts only from the token endpoint, where it is Google's
   * `invalid_grant`. Treating a 400 from Search Analytics the same way sent
   * the owner to redo an OAuth flow that was never broken, and aborted the
   * whole daily run at the first article, because a malformed query body also
   * answers 400.
   */
  get isGrantFailure(): boolean {
    if (this.status === 401 || this.status === 403) return true;
    return this.status === 400 && this.endpoint === 'token';
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof SearchConsoleHttpError) return err.status === 429 || err.status >= 500;
  return true; // network/timeout
}

/** Config that must exist before any call. Throws rather than returning
 *  undefined: every caller has already checked `isSearchConsoleConfigured()`,
 *  so reaching here without credentials is a bug, not a state. */
function requireCredentials(): { clientId: string; clientSecret: string } {
  const clientId = gscClientId();
  const clientSecret = gscClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Search Console is not configured (GSC_CLIENT_ID / GSC_CLIENT_SECRET missing)');
  }
  return { clientId, clientSecret };
}

async function postForm(url: string, body: URLSearchParams): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new SearchConsoleHttpError(res.status, text.slice(0, 500), 'token');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SearchConsoleHttpError(res.status, 'response was not JSON', 'token');
  }
}

/* ------------------------------- OAuth2 -------------------------------- */

/**
 * The URL to send the owner's browser to.
 *
 * `access_type=offline` + `prompt=consent` are BOTH required: without the
 * first, Google returns no refresh token at all; without the second, it
 * returns one only on the very first ever consent, so a re-connect after a
 * disconnect silently yields an access token that dies in an hour and a
 * feature that "worked yesterday".
 */
export function buildAuthUrl(state: string): string {
  const { clientId } = requireCredentials();
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: gscRedirectUri(),
    response_type: 'code',
    scope: GSC_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${gscAuthBaseUrl()}/o/oauth2/v2/auth?${qs.toString()}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().finite().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export interface GoogleTokens {
  accessToken: string;
  /** Absolute expiry, computed here so callers never re-derive it wrong. */
  expiresAt: Date;
  /** Absent on a refresh — Google only re-issues this on the initial grant. */
  refreshToken?: string;
}

function toTokens(raw: unknown): GoogleTokens {
  const parsed = tokenResponseSchema.parse(raw);
  return {
    accessToken: parsed.access_token,
    // 60s of slack: a token that expires while a request is in flight reads
    // as a mysterious 401 rather than as "time to refresh".
    expiresAt: new Date(Date.now() + (parsed.expires_in - 60) * 1000),
    refreshToken: parsed.refresh_token,
  };
}

/** Authorization code → tokens. Called once, from the OAuth callback. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireCredentials();
  const raw = await withResilience(
    'gsc-token',
    () =>
      postForm(
        `${gscTokenBaseUrl()}/token`,
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: gscRedirectUri(),
          grant_type: 'authorization_code',
        }),
      ),
    { isRetryable, retries: 1 },
  );
  return toTokens(raw);
}

/** Refresh token → a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireCredentials();
  const raw = await withResilience(
    'gsc-token',
    () =>
      postForm(
        `${gscTokenBaseUrl()}/token`,
        new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
        }),
      ),
    { isRetryable, retries: 1 },
  );
  return toTokens(raw);
}

/** Best-effort revoke on disconnect, so the grant does not linger in the
 *  owner's Google account after they've turned the feature off here. */
export async function revokeToken(token: string): Promise<void> {
  await postForm(`${gscTokenBaseUrl()}/revoke`, new URLSearchParams({ token }));
}

/* --------------------------- Search Analytics --------------------------- */

const analyticsResponseSchema = z.object({
  rows: z
    .array(
      z.object({
        keys: z.array(z.string()).min(1),
        clicks: z.number().finite().optional(),
        impressions: z.number().finite().optional(),
        ctr: z.number().finite().optional(),
        position: z.number().finite().optional(),
      }),
    )
    .optional(),
});

export interface SearchAnalyticsRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsParams {
  accessToken: string;
  siteUrl: string;
  /** `YYYY-MM-DD`, in the property's own timezone (Google's rule, not ours). */
  startDate: string;
  endDate: string;
  /** The page to report on, as an ABSOLUTE URL — Search Console's `page`
   *  dimension is the full canonical URL, never a site-relative path. */
  pageUrl: string;
  rowLimit?: number;
}

/**
 * Top queries for one page.
 *
 * A `page` FILTER plus a `query` dimension (rather than the two dimensions
 * together) is what keeps the response to one page's worth of rows: the
 * two-dimension form returns the whole property and would have to be filtered
 * here, which for a site with thousands of indexed URLs is a multi-megabyte
 * response per article.
 */
export async function fetchTopQueriesForPage(params: SearchAnalyticsParams): Promise<SearchAnalyticsRow[]> {
  const { accessToken, siteUrl, startDate, endDate, pageUrl, rowLimit = 25 } = params;
  const url = `${gscApiBaseUrl()}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const raw = await withResilience(
    'gsc-api',
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['query'],
          dimensionFilterGroups: [
            { filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] },
          ],
          rowLimit,
          dataState: 'final',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      if (!res.ok) throw new SearchConsoleHttpError(res.status, text.slice(0, 500), 'api');
      return JSON.parse(text) as unknown;
    },
    { isRetryable, retries: 1 },
  );

  const parsed = analyticsResponseSchema.parse(raw);
  return (parsed.rows ?? []).map((r) => ({
    query: r.keys[0]!,
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}
