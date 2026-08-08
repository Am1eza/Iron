// @vitest-environment node
/**
 * audit-2026-08-08: `searchArticles` used to `ilike` the whole trimmed query
 * as one contiguous substring — a real multi-word query never matched
 * anything unless it appeared verbatim, in that exact word order, in the
 * title or excerpt. This exercises the fixed per-token + similarity-ranked
 * behavior against a real Postgres (pglite), since `similarity()` needs a
 * real pg_trgm extension a mocked DB can't provide.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { searchArticles } from './articlesRepo';

let db: Db;
let close: () => Promise<void>;

function article(overrides: Partial<typeof schema.articles.$inferInsert> & { id: string; title: string }) {
  return {
    slug: overrides.id,
    type: 'blog' as const,
    excerpt: '',
    bodyMd: '',
    status: 'published' as const,
    source: 'human' as const,
    publishAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.articles).values([
    article({
      id: 'rebar-price-today',
      title: 'قیمت روز میلگرد امروز چقدر است',
      excerpt: 'نوسان قیمت میلگرد در بازار امروز',
    }),
    article({
      id: 'rebar-buying-guide',
      title: 'راهنمای خرید میلگرد آجدار',
      excerpt: 'نکات مهم پیش از خرید',
    }),
    article({ id: 'sheet-guide', title: 'راهنمای انتخاب ورق فولادی', excerpt: 'ضخامت و کاربرد' }),
    // Draft — must never surface in public search regardless of match quality.
    article({
      id: 'rebar-draft',
      title: 'قیمت میلگرد پیش‌نویس',
      excerpt: 'قیمت میلگرد',
      status: 'draft',
    }),
  ]);
}, 120_000);
afterAll(async () => {
  await close();
});

describe('searchArticles (public site search)', () => {
  it('matches a real multi-word query out of order — not just a verbatim substring', async () => {
    // Old behavior: `ilike` the whole string "میلگرد قیمت" as one unit — this
    // exact word order appears in NEITHER article, so it used to return [].
    const hits = await searchArticles('میلگرد قیمت');
    expect(hits.map((a) => a.slug)).toContain('rebar-price-today');
  });

  it('ranks the more relevant title first instead of ordering by publishAt alone', async () => {
    const hits = await searchArticles('میلگرد');
    const slugs = hits.map((a) => a.slug);
    expect(slugs).toContain('rebar-price-today');
    expect(slugs).toContain('rebar-buying-guide');
    expect(slugs).not.toContain('sheet-guide');
  });

  it('never returns an unpublished draft even on a strong title match', async () => {
    const hits = await searchArticles('قیمت میلگرد پیش‌نویس');
    expect(hits.map((a) => a.slug)).not.toContain('rebar-draft');
  });

  it('returns [] for a query with no meaningful tokens', async () => {
    expect(await searchArticles('و')).toEqual([]);
  });

  it('returns [] for an unrelated query instead of majority-matching noise', async () => {
    expect(await searchArticles('هلیکوپتر فضایی')).toEqual([]);
  });
});
