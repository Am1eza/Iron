// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/db';
import { articles } from '@/lib/server/db/schema';
import { listPublished } from './articlesRepo';

let close: () => Promise<void>;
beforeAll(async () => {
  const database = await createTestDb();
  close = database.close;
  await database.db.insert(articles).values({
    id: 'reading-time',
    slug: 'reading-time',
    type: 'blog',
    title: 'Reading time',
    status: 'published',
    source: 'human',
    publishAt: new Date('2026-01-01'),
    bodyMd: Array.from({ length: 401 }, (_, i) => (i % 2 ? 'steel' : 'فولاد')).join(' \n\t'),
  });
}, 120_000);
afterAll(async () => close?.());

describe('article list reading time', () => {
  it('counts whitespace-delimited words in PostgreSQL, including Persian text', async () => {
    const result = await listPublished('blog');
    expect(result.articles[0]?.readingMinutes).toBe(3);
  });
});
