// @vitest-environment node
/** searchPublishedGuides (AI advisor's searchGuides tool) — token-match +
 *  domain-synonym recall over published guides. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import type { Db } from '@/lib/server/db/client';
import { createArticle, updateArticle, searchPublishedGuides } from './articlesRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = (await createTestDb()) as { db: Db; close: () => Promise<void> });
}, 120_000);
afterAll(async () => {
  await close();
});

async function publishedArticle(input: { title: string; excerpt?: string; bodyMd?: string }) {
  const slug = `guide-${ulid()}`;
  const created = await createArticle({ slug, type: 'blog', title: input.title, excerpt: input.excerpt, bodyMd: input.bodyMd });
  const published = await updateArticle(created.id, { status: 'published', publishAt: new Date('2026-01-01') });
  return published!;
}

describe('searchPublishedGuides', () => {
  it('finds an article by its literal title tokens', async () => {
    const a = await publishedArticle({ title: `قیمت میلگرد و عوامل مؤثر ${ulid()}` });
    const hits = await searchPublishedGuides(a.title);
    expect(hits.map((h) => h.id)).toContain(a.id);
  });

  it('finds a «قیمت»-titled guide when the question uses the synonym «نرخ»', async () => {
    const unique = ulid();
    const a = await publishedArticle({ title: `قیمت میلگرد امروز ${unique}` });
    const hits = await searchPublishedGuides(`نرخ میلگرد امروز ${unique}`);
    expect(hits.map((h) => h.id)).toContain(a.id);
  });

  it('finds a «وزن»-titled guide when the question uses «محاسبه» + «سنگینی»', async () => {
    const unique = ulid();
    const a = await publishedArticle({ title: `جدول وزن تیرآهن ${unique}`, bodyMd: 'راهنمای محاسبه دقیق' });
    const hits = await searchPublishedGuides(`سنگینی تیرآهن ${unique}`);
    expect(hits.map((h) => h.id)).toContain(a.id);
  });

  it('returns [] when nothing in the corpus is even a minority match', async () => {
    const hits = await searchPublishedGuides(`این یک عبارت کاملاً نامرتبط است ${ulid()}`);
    expect(hits).toEqual([]);
  });
});
