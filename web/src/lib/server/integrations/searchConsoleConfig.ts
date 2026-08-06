/**
 * Google Search Console — configuration, and the switch that keeps the whole
 * feature invisible until the owner supplies credentials (US-14.4).
 *
 * ── This feature ships DISABLED, on purpose ───────────────────────────────
 * Talking to Search Console needs an OAuth client (client id + secret) created
 * in a Google Cloud project by a human who owns the ahantime.com property.
 * No agent can create one, and inventing a placeholder that 400s at the first
 * request would be worse than nothing. So: absent env → `isSearchConsoleConfigured()`
 * is false → the API routes answer a plain "not configured", the refresh job
 * no-ops, and the article editor renders no Search Console panel at all. The
 * moment the four variables are set and the container restarts, the same code
 * lights up with nothing else to change.
 *
 * ── Network: direct, NOT via a relay ──────────────────────────────────────
 * The AI provider is reached through an out-of-Iran relay because its endpoint
 * is unreachable from here. Google's is not: measured from this host AND from
 * inside the `web` container, `accounts.google.com` (302),
 * `oauth2.googleapis.com` (404 for a GET on /token, i.e. it answered),
 * `searchconsole.googleapis.com/$discovery` (200) and
 * `www.googleapis.com/webmasters/v3/sites` (403 = "authenticate first", i.e.
 * it answered) all respond in well under a second. So the default base URLs
 * are Google's own and no relay is deployed.
 *
 * The three `*_BASE_URL` overrides exist anyway, and are the SAME shape as
 * `AI_BASE_URL` (`aiRelayConfig.ts`) on purpose: if Google is filtered later —
 * which is a policy decision made outside this repo and has happened to other
 * providers — pointing them at an out-of-Iran reverse proxy is a `.env` edit,
 * not a code change. Each one is read independently because the three hosts
 * are genuinely different services and a relay may only need to cover one.
 */

/** First non-empty value among the given env keys. Empty string counts as
 *  unset: docker-compose passes absent optional vars as `${VAR:-}`. */
function pick(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Trailing slashes are a classic source of `//` in a built URL. */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function gscClientId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'GSC_CLIENT_ID');
}
export function gscClientSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'GSC_CLIENT_SECRET');
}
/**
 * The property exactly as Search Console spells it — `sc-domain:ahantime.com`
 * for a Domain property, or `https://ahantime.com/` (WITH the trailing slash)
 * for a URL-prefix property. Google matches this string literally; a mismatch
 * is a 403 that looks like a permissions problem.
 */
export function gscSiteUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'GSC_SITE_URL');
}
/**
 * Must byte-match one of the "Authorised redirect URIs" on the OAuth client.
 * Defaults to the panel host's callback route, which is where the owner will
 * be when they click «اتصال».
 */
export function gscRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  return pick(env, 'GSC_REDIRECT_URI') ?? 'https://panel.ahantime.com/api/admin/seo/search-console/callback';
}

/* --------------------------- endpoints (relay-able) --------------------------- */

export function gscAuthBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return trimSlash(pick(env, 'GSC_AUTH_BASE_URL') ?? 'https://accounts.google.com');
}
export function gscTokenBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return trimSlash(pick(env, 'GSC_TOKEN_BASE_URL') ?? 'https://oauth2.googleapis.com');
}
export function gscApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return trimSlash(pick(env, 'GSC_API_BASE_URL') ?? 'https://searchconsole.googleapis.com');
}

/** Read-only. This integration never writes to Search Console and must never
 *  be able to — a wider scope on the consent screen is a promise we'd be
 *  making to the owner that the code doesn't need. */
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

/**
 * All three secrets present? This is the ONE predicate the routes, the job and
 * the UI gate on — there is no second definition of "is this feature on".
 */
export function isSearchConsoleConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(gscClientId(env) && gscClientSecret(env) && gscSiteUrl(env));
}
