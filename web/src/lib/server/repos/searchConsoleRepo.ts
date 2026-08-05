/**
 * Google Search Console persistence (US-14.4) — the OAuth grant and the
 * cached per-page query metrics.
 *
 * Two tables, two very different lifetimes: `search_console_auth` holds ONE
 * long-lived row (a refresh token) that only an explicit connect/disconnect
 * changes, while `search_console_metrics` is a disposable cache replaced
 * wholesale per path on every refresh. Nothing here talks to Google — see
 * `integrations/searchConsole.ts` for that, and
 * `services/searchConsole.service.ts` for the orchestration between the two.
 */
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { searchConsoleAuth, searchConsoleMetrics } from '@/lib/server/db/schema';

export type SearchConsoleAuthRow = typeof searchConsoleAuth.$inferSelect;
export type SearchConsoleMetricRow = typeof searchConsoleMetrics.$inferSelect;

/** There is one Search Console property, so there is one row. */
export const AUTH_ROW_ID = 'default';

/** How long an in-flight authorization redirect stays valid. Google's own
 *  consent screen rarely takes more than a minute; ten gives a slow human
 *  room without leaving a usable CSRF nonce lying around for an afternoon. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/* --------------------------------- auth --------------------------------- */

export async function getAuthRow(): Promise<SearchConsoleAuthRow | null> {
  const rows = await getDb().select().from(searchConsoleAuth).where(eq(searchConsoleAuth.id, AUTH_ROW_ID)).limit(1);
  return rows[0] ?? null;
}

/** Start an authorization: store the CSRF nonce, keeping any existing grant
 *  intact so an abandoned re-connect doesn't disconnect a working one. */
export async function beginOAuth(state: string): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(searchConsoleAuth)
    .values({ id: AUTH_ROW_ID, oauthState: state, oauthStateAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: searchConsoleAuth.id,
      set: { oauthState: state, oauthStateAt: now, updatedAt: now },
    });
}

/**
 * Consume the stored nonce.
 *
 * ONE conditional statement, not read-then-write. The first version read the
 * row, cleared the nonce unconditionally, and only then compared — which meant
 * any stray hit on the callback URL (a browser prefetch, a back-navigation, a
 * second panel tab) destroyed the nonce of a consent the admin was still in
 * the middle of giving, and the real callback then failed with nothing but
 * `?searchConsole=invalid` to show for it. It was also a read-then-write race,
 * so two identical callbacks could both be told "valid".
 *
 * One `UPDATE … WHERE oauth_state = $state AND oauth_state_at > $cutoff` makes
 * the match, the freshness test and the consumption a single atomic step:
 * exactly one caller can ever win, and a wrong or stale `state` changes
 * nothing at all.
 *
 * The TTL is in the WHERE clause, not read back from `RETURNING`, because
 * Postgres's `RETURNING` on an UPDATE yields the POST-update values — and
 * this statement sets `oauth_state_at` to null, so reading the timestamp
 * from it returned null for every caller including the legitimate one.
 */
export async function consumeOAuthState(state: string): Promise<boolean> {
  if (!state) return false;
  const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MS);
  const claimed = await getDb()
    .update(searchConsoleAuth)
    .set({ oauthState: null, oauthStateAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(searchConsoleAuth.id, AUTH_ROW_ID),
        eq(searchConsoleAuth.oauthState, state),
        gt(searchConsoleAuth.oauthStateAt, cutoff),
      ),
    )
    .returning({ id: searchConsoleAuth.id });
  return claimed.length > 0;
}

export async function saveGrant(input: {
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  siteUrl: string;
}): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(searchConsoleAuth)
    .values({
      id: AUTH_ROW_ID,
      refreshToken: input.refreshToken,
      accessToken: input.accessToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      siteUrl: input.siteUrl,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: searchConsoleAuth.id,
      set: {
        refreshToken: input.refreshToken,
        accessToken: input.accessToken,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        siteUrl: input.siteUrl,
        lastError: null,
        updatedAt: now,
      },
    });
}

/** Cache a refreshed access token. The refresh token is untouched — Google
 *  does not re-issue one on refresh, and overwriting it with `undefined` is
 *  how a working connection quietly becomes a dead one. */
export async function saveAccessToken(accessToken: string, expiresAt: Date): Promise<void> {
  await getDb()
    .update(searchConsoleAuth)
    .set({ accessToken, accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(searchConsoleAuth.id, AUTH_ROW_ID));
}

export async function recordSyncSuccess(at: Date = new Date()): Promise<void> {
  await getDb()
    .update(searchConsoleAuth)
    .set({ lastSyncAt: at, lastError: null, updatedAt: at })
    .where(eq(searchConsoleAuth.id, AUTH_ROW_ID));
}

export async function recordSyncError(message: string): Promise<void> {
  await getDb()
    .update(searchConsoleAuth)
    .set({ lastError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(searchConsoleAuth.id, AUTH_ROW_ID));
}

/**
 * Forget the grant. Returns the refresh token that was stored so the caller
 * can revoke it with Google — clearing our copy without revoking leaves the
 * app listed in the owner's Google account with access it no longer uses.
 *
 * The cached metrics are deleted too: they are Search Console's data, shown
 * under a connection that no longer exists.
 */
export async function clearGrant(): Promise<string | null> {
  const row = await getAuthRow();
  if (!row) return null;
  await getDb()
    .update(searchConsoleAuth)
    .set({
      refreshToken: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      oauthState: null,
      oauthStateAt: null,
      lastSyncAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(searchConsoleAuth.id, AUTH_ROW_ID));
  await getDb().delete(searchConsoleMetrics);
  return row.refreshToken;
}

/* -------------------------------- metrics -------------------------------- */

export interface MetricInput {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Replace everything cached for one path.
 *
 * DELETE-then-INSERT inside a transaction, not an upsert-and-leave: Search
 * Console's top-N for a page changes over time, and an upsert alone leaves
 * yesterday's queries sitting next to today's with a stale `fetchedAt`,
 * which the panel would render as one undifferentiated list.
 *
 * The insert then upserts on the unique (path, query) key ANYWAY, for the one
 * race the transaction does not cover: the editor's «به‌روزرسانی» button
 * firing while the daily job is already on this path. With no cached rows
 * there is nothing for the two DELETEs to lock against, so both proceed and
 * the second INSERT would hit a duplicate key, abort its transaction, and
 * surface to the admin as a failed refresh of a request that in fact
 * succeeded. Last writer wins, which is correct — both wrote the same window.
 */
export async function replacePathMetrics(
  path: string,
  rows: MetricInput[],
  period: { start: Date; end: Date },
  fetchedAt: Date = new Date(),
): Promise<void> {
  // Dedupe by query FIRST. Postgres refuses an `ON CONFLICT DO UPDATE` whose
  // own VALUES list hits the same key twice ("cannot affect row a second
  // time"), so a response carrying one query under two spellings would abort
  // the whole transaction. Last occurrence wins, matching the upsert below.
  const byQuery = new Map<string, MetricInput>();
  for (const r of rows) byQuery.set(r.query, r);
  const unique = [...byQuery.values()];

  await getDb().transaction(async (tx) => {
    await tx.delete(searchConsoleMetrics).where(eq(searchConsoleMetrics.path, path));
    if (unique.length === 0) return;
    await tx
      .insert(searchConsoleMetrics)
      .values(
        unique.map((r) => ({
          id: ulid(),
          path,
          query: r.query,
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
          periodStart: period.start,
          periodEnd: period.end,
          fetchedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [searchConsoleMetrics.path, searchConsoleMetrics.query],
        set: {
          clicks: sql`excluded.clicks`,
          impressions: sql`excluded.impressions`,
          ctr: sql`excluded.ctr`,
          position: sql`excluded.position`,
          periodStart: sql`excluded.period_start`,
          periodEnd: sql`excluded.period_end`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  });
}

/** Cached rows for one path, best-performing first. */
export async function getPathMetrics(path: string, limit = 25): Promise<SearchConsoleMetricRow[]> {
  return getDb()
    .select()
    .from(searchConsoleMetrics)
    .where(eq(searchConsoleMetrics.path, path))
    .orderBy(desc(searchConsoleMetrics.impressions), desc(searchConsoleMetrics.clicks))
    .limit(limit);
}

/** Paths that have cached rows — used to prune pages that no longer exist. */
export async function deleteMetricsForPathsNotIn(keep: string[]): Promise<void> {
  const existing = await getDb()
    .selectDistinct({ path: searchConsoleMetrics.path })
    .from(searchConsoleMetrics);
  const stale = existing.map((r) => r.path).filter((p) => !keep.includes(p));
  if (stale.length === 0) return;
  await getDb().delete(searchConsoleMetrics).where(inArray(searchConsoleMetrics.path, stale));
}

/** Test/diagnostic helper: the exact row for one (path, query) pair. */
export async function getMetricRow(path: string, query: string): Promise<SearchConsoleMetricRow | null> {
  const rows = await getDb()
    .select()
    .from(searchConsoleMetrics)
    .where(and(eq(searchConsoleMetrics.path, path), eq(searchConsoleMetrics.query, query)))
    .limit(1);
  return rows[0] ?? null;
}
