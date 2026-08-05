/**
 * SEO admin tooling (US-14.3) — URL redirects. A separate concern from
 * `content.ts` (author-written pages) and `system.ts` (operational logs):
 * this is site infrastructure an admin configures, not content, and not a
 * log — same one-concern-per-file convention as market.ts/leads.ts/orders.ts.
 */
import { boolean, index, pgTable, real, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const redirects = pgTable('redirects', {
  id: text('id').primaryKey(),
  // Normalized: leading slash, no trailing slash (except root), no query
  // string — see redirectsRepo.ts's normalizePath(). `.unique()` already
  // gives a lookup-by-path a single indexed hit (no separate index needed),
  // and stops two admins creating conflicting redirects for the same source.
  fromPath: text('from_path').notNull().unique(),
  toPath: text('to_path').notNull(),
  // Next's App Router `redirect()`/`permanentRedirect()` (next/navigation)
  // only ever emit 307/308 — there is no supported way to make a Server
  // Component literally answer 301/302. `permanent` maps to the nearest
  // modern equivalent search engines already treat as such (308≈301,
  // 307≈302), rather than storing a literal status code this app can't
  // actually produce.
  permanent: boolean('permanent').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cached Google Search Console rows (US-14.4) — one row per (path, query)
 * pair, replaced wholesale for a path on every refresh (see
 * `searchConsoleRepo.replacePathMetrics`), never accumulated/appended. GSC
 * itself is the source of truth and is queried fresh on a schedule
 * (`searchConsoleRefresh.job.ts`); this table exists only so the admin panel
 * can render "top queries for this article" without an API round trip (and
 * a multi-second Google Search Analytics call) on every page load of the
 * content editor, and so the feature still shows its last-known data if the
 * connection is briefly unavailable. Not a historical log — `fetchedAt` is
 * "when this row was last confirmed current," not an event timestamp.
 */
export const searchConsoleMetrics = pgTable(
  'search_console_metrics',
  {
    id: text('id').primaryKey(),
    // The site-relative path the row is about, e.g. `/blog/steel-weight-guide`
    // — matches `articlePath()`'s output, not an article id, so this can
    // later cover non-article pages (category/SKU pages) with no schema
    // change.
    path: text('path').notNull(),
    query: text('query').notNull(),
    clicks: real('clicks').notNull().default(0),
    impressions: real('impressions').notNull().default(0),
    ctr: real('ctr').notNull().default(0),
    // Average SERP position — fractional (e.g. 4.7), never rounded here;
    // the UI decides how to display it.
    position: real('position').notNull().default(0),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_console_metrics_path_idx').on(t.path),
    // One row per query per path — `replacePathMetrics` upserts against
    // this, and it is what stops a stale row from a smaller previous result
    // set lingering next to fresher ones after a query drops out of GSC's
    // top results for that path.
    unique('search_console_metrics_path_query_key').on(t.path, t.query),
  ],
);

/**
 * The single Google Search Console OAuth grant (US-14.4).
 *
 * WHY A TABLE AND NOT THE `settings` KEY-VALUE ROW
 * ------------------------------------------------
 * `settings` was the obvious home — it is where every other admin-configured
 * value lives. But `GET /api/admin/settings` returns `listSettings()`
 * WHOLESALE, so a refresh token parked there would be handed to the browser
 * of anyone holding `settings:write`, in a response the settings screen
 * renders. A long-lived Google credential is not an admin-visible setting; it
 * is a secret that must never leave the server, so it gets a table no route
 * dumps.
 *
 * Exactly one row, `id = 'default'`: this site has one Search Console
 * property. Modelling it as a table rather than a singleton column set is
 * only so a second property (a future subdomain) needs no migration.
 */
export const searchConsoleAuth = pgTable('search_console_auth', {
  /** Always `'default'` — see above. */
  id: text('id').primaryKey(),
  /** The property as Search Console spells it (`sc-domain:…` or a URL prefix).
   *  Copied from `GSC_SITE_URL` at connect time and stored, so a later env
   *  change is visible as a mismatch rather than silently querying a
   *  different property with a grant issued for this one. */
  siteUrl: text('site_url'),
  /**
   * Long-lived. Null between «اتصال» being clicked and the callback landing —
   * the row exists in that window only to hold `oauthState`.
   *
   * PLAINTEXT, and unavoidably so: unlike `refreshTokens.tokenHash` in
   * `schema/auth.ts` (sha256 + pepper) this credential has to be REPLAYED to
   * Google, so it cannot be hashed. The consequence is worth stating out loud
   * for whoever owns the backups: from this migration on, a restic snapshot
   * taken by `ops/ahantime-db-backup.sh` — and any `pg_dump` — contains a live
   * Google credential that it did not contain before. It is read-only
   * (`webmasters.readonly`), it is revocable from the owner's Google account
   * and from «قطع اتصال» here, and no route ever returns it.
   */
  refreshToken: text('refresh_token'),
  /** Short-lived; cached only to avoid a token round trip per request. */
  accessToken: text('access_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  /** CSRF nonce for the authorization redirect — generated on «اتصال»,
   *  required to match on the callback, cleared immediately after. */
  oauthState: text('oauth_state'),
  oauthStateAt: timestamp('oauth_state_at', { withTimezone: true }),
  /** Last successful metrics refresh, for the panel's "as of" line. */
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  /** Last failure, in plain Persian, so a broken grant is visible in the
   *  panel instead of only in the error tracker. */
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
