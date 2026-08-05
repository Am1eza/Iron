// @vitest-environment node
/**
 * Search Console persistence (US-14.4), against a real Postgres.
 *
 * Two behaviours here are load-bearing and neither is visible by reading the
 * call site:
 *
 *  - The metrics cache must REPLACE, not accumulate. A query that drops out of
 *    Google's top-N for a page has to disappear from the panel rather than sit
 *    next to fresher rows looking current.
 *  - The OAuth nonce must be single-use, time-bounded, and — the part the
 *    first version got wrong — must not be destroyed by a callback that does
 *    NOT match it, which would kill a consent the admin was still giving.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from '@/test/db';
import type { Db } from '@/lib/server/db/client';
import {
  AUTH_ROW_ID,
  OAUTH_STATE_TTL_MS,
  beginOAuth,
  clearGrant,
  consumeOAuthState,
  deleteMetricsForPathsNotIn,
  getAuthRow,
  getMetricRow,
  getPathMetrics,
  replacePathMetrics,
  saveAccessToken,
  saveGrant,
} from './searchConsoleRepo';
import { getDb } from '@/lib/server/db/client';
import { searchConsoleAuth, searchConsoleMetrics } from '@/lib/server/db/schema';

let close: () => Promise<void>;

const PERIOD = { start: new Date('2026-07-06T00:00:00Z'), end: new Date('2026-08-02T00:00:00Z') };
const row = (query: string, impressions = 10) => ({ query, clicks: 1, impressions, ctr: 0.1, position: 4.7 });

beforeAll(async () => {
  ({ close } = (await createTestDb()) as { db: Db; close: () => Promise<void> });
}, 120_000);
afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await getDb().delete(searchConsoleMetrics);
  await getDb().delete(searchConsoleAuth);
});

describe('replacePathMetrics', () => {
  it('stores rows for a path and reads them back best-performing first', async () => {
    await replacePathMetrics('/blog/a', [row('قیمت میلگرد', 5), row('میلگرد اصفهان', 90)], PERIOD);
    const rows = await getPathMetrics('/blog/a');
    expect(rows.map((r) => r.query)).toEqual(['میلگرد اصفهان', 'قیمت میلگرد']);
    expect(rows[0]!.position).toBeCloseTo(4.7, 5);
  });

  it('REPLACES the previous set — a query that drops out of the top-N disappears', async () => {
    await replacePathMetrics('/blog/a', [row('قدیمی'), row('ماندگار')], PERIOD);
    await replacePathMetrics('/blog/a', [row('ماندگار'), row('تازه')], PERIOD);
    const rows = await getPathMetrics('/blog/a');
    expect(rows.map((r) => r.query).sort()).toEqual(['تازه', 'ماندگار']);
    expect(await getMetricRow('/blog/a', 'قدیمی')).toBeNull();
  });

  it('does not touch another path', async () => {
    await replacePathMetrics('/blog/a', [row('الف')], PERIOD);
    await replacePathMetrics('/blog/b', [row('ب')], PERIOD);
    expect((await getPathMetrics('/blog/a')).map((r) => r.query)).toEqual(['الف']);
    expect((await getPathMetrics('/blog/b')).map((r) => r.query)).toEqual(['ب']);
  });

  it('survives a duplicate (path, query) in one batch instead of aborting', async () => {
    // The unique constraint would otherwise raise 23505, roll the whole
    // transaction back, and surface to the admin as a failed refresh.
    await replacePathMetrics('/blog/a', [row('تکراری', 5), row('تکراری', 50)], PERIOD);
    const rows = await getPathMetrics('/blog/a');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.impressions).toBe(50); // last writer wins
  });

  it('an empty result set clears the cache rather than leaving it stale', async () => {
    await replacePathMetrics('/blog/a', [row('چیزی')], PERIOD);
    await replacePathMetrics('/blog/a', [], PERIOD);
    expect(await getPathMetrics('/blog/a')).toEqual([]);
  });
});

describe('deleteMetricsForPathsNotIn', () => {
  it('prunes pages that no longer exist and keeps the ones that do', async () => {
    await replacePathMetrics('/blog/live', [row('الف')], PERIOD);
    await replacePathMetrics('/blog/unpublished', [row('ب')], PERIOD);
    await deleteMetricsForPathsNotIn(['/blog/live']);
    expect(await getPathMetrics('/blog/live')).toHaveLength(1);
    expect(await getPathMetrics('/blog/unpublished')).toEqual([]);
  });

  it('is a no-op when nothing is stale', async () => {
    await replacePathMetrics('/blog/live', [row('الف')], PERIOD);
    await deleteMetricsForPathsNotIn(['/blog/live']);
    expect(await getPathMetrics('/blog/live')).toHaveLength(1);
  });
});

describe('consumeOAuthState', () => {
  it('accepts the matching nonce exactly once', async () => {
    await beginOAuth('nonce-1');
    expect(await consumeOAuthState('nonce-1')).toBe(true);
    expect(await consumeOAuthState('nonce-1')).toBe(false);
  });

  it('rejects a wrong nonce WITHOUT destroying the real one', async () => {
    // The first version cleared the row unconditionally, so a stray callback
    // (a prefetch, a back-navigation, a second tab) killed a consent the
    // admin was still in the middle of giving.
    await beginOAuth('real');
    expect(await consumeOAuthState('forged')).toBe(false);
    expect(await consumeOAuthState('real')).toBe(true);
  });

  it('rejects an empty state and one with no row at all', async () => {
    expect(await consumeOAuthState('')).toBe(false);
    expect(await consumeOAuthState('anything')).toBe(false);
  });

  it('rejects an expired nonce', async () => {
    await beginOAuth('old');
    await getDb()
      .update(searchConsoleAuth)
      .set({ oauthStateAt: new Date(Date.now() - OAUTH_STATE_TTL_MS - 1000) });
    expect(await consumeOAuthState('old')).toBe(false);
  });

  it('starting an authorization does not disturb an existing grant', async () => {
    await saveGrant({
      refreshToken: 'refresh-abc',
      accessToken: 'access-abc',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      siteUrl: 'sc-domain:ahantime.com',
    });
    await beginOAuth('nonce-2');
    const rowAfter = await getAuthRow();
    expect(rowAfter?.refreshToken).toBe('refresh-abc');
    expect(rowAfter?.id).toBe(AUTH_ROW_ID);
  });
});

describe('grant lifecycle', () => {
  it('refreshing the access token leaves the refresh token intact', async () => {
    await saveGrant({
      refreshToken: 'refresh-abc',
      accessToken: 'access-1',
      accessTokenExpiresAt: new Date(Date.now() + 1000),
      siteUrl: 'sc-domain:ahantime.com',
    });
    await saveAccessToken('access-2', new Date(Date.now() + 3600_000));
    const rowAfter = await getAuthRow();
    // Google does not re-issue a refresh token on refresh; overwriting it is
    // how a working connection quietly becomes a dead one.
    expect(rowAfter?.refreshToken).toBe('refresh-abc');
    expect(rowAfter?.accessToken).toBe('access-2');
  });

  it('clearGrant returns the token to revoke and drops the cached metrics', async () => {
    await saveGrant({
      refreshToken: 'refresh-abc',
      accessToken: 'access-1',
      accessTokenExpiresAt: new Date(Date.now() + 1000),
      siteUrl: 'sc-domain:ahantime.com',
    });
    await replacePathMetrics('/blog/a', [row('الف')], PERIOD);
    expect(await clearGrant()).toBe('refresh-abc');
    const rowAfter = await getAuthRow();
    expect(rowAfter?.refreshToken).toBeNull();
    expect(await getPathMetrics('/blog/a')).toEqual([]);
  });

  it('clearGrant on a never-connected install is a no-op', async () => {
    expect(await clearGrant()).toBeNull();
  });
});
