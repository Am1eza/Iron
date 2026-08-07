// @vitest-environment node
/**
 * Category-filtered article reads (US-14.5) — `listPublishedByCategory` and
 * `categoryArticleCounts` both use real Postgres jsonb operators
 * (`@>` containment, `jsonb_array_elements_text`), which a mocked DB can't
 * exercise honestly — hence a real (pglite) database, like the rest of this
 * directory's `.pg.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { listPublishedByCategory, categoryArticleCounts } from './articlesRepo';

let db: Db;
let close: () => Promise<void>;

const REBAR = 'cat-rebar';
const IBEAM = 'cat-ibeam';
const PROFILE = 'cat-profile';

function article(overrides: Partial<typeof schema.articles.$inferInsert> & { id: string }) {
  return {
    slug: overrides.id,
    type: 'blog' as const,
    title: overrides.id,
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
    // Two categories at once — proves an article counts toward BOTH, not
    // just the first, and shows up in either category's list.
    article({ id: 'rebar-and-ibeam', relatedCategoryIds: [REBAR, IBEAM] }),
    article({ id: 'rebar-only', relatedCategoryIds: [REBAR] }),
    // A news item, deliberately — proves the query is NOT scoped to `type`,
    // unlike `listPublished`.
    article({ id: 'rebar-news', type: 'news', relatedCategoryIds: [REBAR] }),
    // Draft/scheduled — must never appear even though it's in the category.
    article({ id: 'rebar-draft', relatedCategoryIds: [REBAR], status: 'draft' }),
    article({
      id: 'rebar-scheduled',
      relatedCategoryIds: [REBAR],
      status: 'scheduled',
      publishAt: new Date('2099-01-01T00:00:00Z'),
    }),
    // A real published article with no category at all — must never show up
    // anywhere the counts/list are grouped by category.
    article({ id: 'uncategorized', relatedCategoryIds: null }),
    // A different category entirely — must never leak into REBAR's results.
    article({ id: 'profile-only', relatedCategoryIds: [PROFILE] }),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('listPublishedByCategory', () => {
  it('returns only published articles in the given category, across both blog and news', async () => {
    const { articles, total } = await listPublishedByCategory(REBAR);
    const slugs = articles.map((a) => a.slug).sort();
    expect(slugs).toEqual(['rebar-and-ibeam', 'rebar-news', 'rebar-only']);
    expect(total).toBe(3);
  });

  it('excludes draft and scheduled articles even when categorised', async () => {
    const { articles } = await listPublishedByCategory(REBAR);
    expect(articles.some((a) => a.slug === 'rebar-draft')).toBe(false);
    expect(articles.some((a) => a.slug === 'rebar-scheduled')).toBe(false);
  });

  it('an article filed under two categories appears in both', async () => {
    const rebar = await listPublishedByCategory(REBAR);
    const ibeam = await listPublishedByCategory(IBEAM);
    expect(rebar.articles.some((a) => a.slug === 'rebar-and-ibeam')).toBe(true);
    expect(ibeam.articles.some((a) => a.slug === 'rebar-and-ibeam')).toBe(true);
  });

  it('returns nothing for a category no published article is filed under', async () => {
    const { articles, total } = await listPublishedByCategory('cat-nonexistent');
    expect(articles).toEqual([]);
    expect(total).toBe(0);
  });
});

describe('categoryArticleCounts', () => {
  it('counts published articles per category, crediting a multi-category article to each', async () => {
    const counts = await categoryArticleCounts();
    expect(counts[REBAR]).toBe(3);
    expect(counts[IBEAM]).toBe(1);
    expect(counts[PROFILE]).toBe(1);
  });

  it('never counts a category with zero published articles', async () => {
    const counts = await categoryArticleCounts();
    expect(counts['cat-nonexistent']).toBeUndefined();
  });
});
