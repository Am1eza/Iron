// @vitest-environment node
/**
 * News-topic-filtered reads (اخبار بازار) — `listPublishedByNewsTopic` and
 * `newsTopicArticleCounts`, the news-only mirror of
 * `articlesRepo.category.pg.test.ts`. Real Postgres jsonb operators, so a
 * real (pglite) database, same as the rest of this directory's
 * `.pg.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { listPublishedByNewsTopic, newsTopicArticleCounts } from './articlesRepo';

let db: Db;
let close: () => Promise<void>;

const RATES = 'rates-exchange';
const PRODUCTION = 'production-mills';
const TRADE = 'trade';

function article(overrides: Partial<typeof schema.articles.$inferInsert> & { id: string }) {
  return {
    slug: overrides.id,
    type: 'news' as const,
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
    // Two topics at once — proves an article counts toward BOTH, not just
    // the first, and shows up in either topic's list.
    article({ id: 'rates-and-production', relatedNewsTopicIds: [RATES, PRODUCTION] }),
    article({ id: 'rates-only', relatedNewsTopicIds: [RATES] }),
    // A BLOG post with the same topic id — must never appear. Unlike
    // `listPublishedByCategory` (deliberately cross-type), a topic is a
    // news-only lens (see lib/data/newsTopics.ts) — this is the mirror-image
    // assertion of that file's "not scoped to type" test.
    article({ id: 'rates-but-blog', type: 'blog', relatedNewsTopicIds: [RATES] }),
    // Draft/scheduled — must never appear even though it's in the topic.
    article({ id: 'rates-draft', relatedNewsTopicIds: [RATES], status: 'draft' }),
    article({
      id: 'rates-scheduled',
      relatedNewsTopicIds: [RATES],
      status: 'scheduled',
      publishAt: new Date('2099-01-01T00:00:00Z'),
    }),
    // A real published news article with no topic at all — must never show
    // up anywhere the counts/list are grouped by topic.
    article({ id: 'untagged', relatedNewsTopicIds: null }),
    // A different topic entirely — must never leak into RATES's results.
    article({ id: 'trade-only', relatedNewsTopicIds: [TRADE] }),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('listPublishedByNewsTopic', () => {
  it('returns only published NEWS articles in the given topic', async () => {
    const { articles, total } = await listPublishedByNewsTopic(RATES);
    const slugs = articles.map((a) => a.slug).sort();
    expect(slugs).toEqual(['rates-and-production', 'rates-only']);
    expect(total).toBe(2);
  });

  it('excludes a blog article even when it carries the same topic id', async () => {
    const { articles } = await listPublishedByNewsTopic(RATES);
    expect(articles.some((a) => a.slug === 'rates-but-blog')).toBe(false);
  });

  it('excludes draft and scheduled articles even when tagged', async () => {
    const { articles } = await listPublishedByNewsTopic(RATES);
    expect(articles.some((a) => a.slug === 'rates-draft')).toBe(false);
    expect(articles.some((a) => a.slug === 'rates-scheduled')).toBe(false);
  });

  it('an article filed under two topics appears in both', async () => {
    const rates = await listPublishedByNewsTopic(RATES);
    const production = await listPublishedByNewsTopic(PRODUCTION);
    expect(rates.articles.some((a) => a.slug === 'rates-and-production')).toBe(true);
    expect(production.articles.some((a) => a.slug === 'rates-and-production')).toBe(true);
  });

  it('returns nothing for a topic no published news article is filed under', async () => {
    const { articles, total } = await listPublishedByNewsTopic('no-such-topic');
    expect(articles).toEqual([]);
    expect(total).toBe(0);
  });
});

describe('newsTopicArticleCounts', () => {
  it('counts published news per topic, crediting a multi-topic article to each', async () => {
    const counts = await newsTopicArticleCounts();
    expect(counts[RATES]).toBe(2);
    expect(counts[PRODUCTION]).toBe(1);
    expect(counts[TRADE]).toBe(1);
  });

  it('never counts the blog article carrying a topic id, even though it exists', async () => {
    const counts = await newsTopicArticleCounts();
    // RATES already asserted as 2 above — this test exists to make the
    // exclusion an explicit, named assertion rather than an implicit
    // side-effect of that count being right.
    expect(counts[RATES]).toBe(2);
  });

  it('never counts a topic with zero published news articles', async () => {
    const counts = await newsTopicArticleCounts();
    expect(counts['no-such-topic']).toBeUndefined();
  });
});
