// @vitest-environment node
/**
 * Articles — the approval gate (publishDueArticles must never auto-live an
 * article that skipped POST .../publish and its approvedBy stamp) plus the
 * public-read published-only filter. No prior coverage existed for this repo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import type { Db } from '@/lib/server/db/client';
import { createArticle, updateArticle, publishDueArticles, findPublishedBySlug } from '@/lib/server/repos/articlesRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('publish approval gate', () => {
  it('never auto-publishes a scheduled article with no approvedBy, even when publishAt is due', async () => {
    const article = await createArticle({ slug: `unapproved-${Date.now()}`, type: 'blog', title: 'تست' });
    await updateArticle(article.id, {
      status: 'scheduled',
      publishAt: new Date(Date.now() - 60_000), // due a minute ago
      // approvedBy intentionally omitted — this is exactly the state a
      // PATCH-only bypass (fixed in admin/articles/[id]/route.ts) used to
      // reach without ever going through the approval endpoint.
    });
    const published = await publishDueArticles();
    expect(published).toBe(0);

    const live = await findPublishedBySlug(article.slug);
    expect(live).toBeNull();
  });

  it('publishes a due, approved article (the real /publish flow)', async () => {
    const article = await createArticle({ slug: `approved-${Date.now()}`, type: 'blog', title: 'تست' });
    await updateArticle(article.id, {
      status: 'scheduled',
      publishAt: new Date(Date.now() - 60_000),
      approvedBy: 'u-admin',
    });
    const published = await publishDueArticles();
    expect(published).toBeGreaterThanOrEqual(1);

    const live = await findPublishedBySlug(article.slug);
    expect(live?.status).toBe('published');
  });

  it('never publishes a scheduled article whose publishAt is still in the future', async () => {
    const article = await createArticle({ slug: `future-${Date.now()}`, type: 'blog', title: 'تست' });
    await updateArticle(article.id, {
      status: 'scheduled',
      publishAt: new Date(Date.now() + 60 * 60 * 1000),
      approvedBy: 'u-admin',
    });
    await publishDueArticles();
    const live = await findPublishedBySlug(article.slug);
    expect(live).toBeNull();
  });
});

describe('public reads', () => {
  it('never surface a draft article by slug', async () => {
    const article = await createArticle({ slug: `draft-${Date.now()}`, type: 'blog', title: 'پیش‌نویس' });
    expect(await findPublishedBySlug(article.slug)).toBeNull();
  });
});

describe('body_md is derived from body_json, never authored (US-12.4)', () => {
  it('writes a markdown mirror whenever a structured body is saved', async () => {
    // Site search, the AI advisor's `searchGuides` grounding and the SEO
    // word count all read `body_md`. If the derivation lived in the route
    // handler instead of the repo, any other writer — a job, an AI drafter —
    // would silently store a body that none of those three can see.
    const article = await createArticle({
      slug: `derived-${Date.now()}`,
      type: 'blog',
      title: 'تست',
      bodyJson: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'عنوان بخش' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'متن آزمایشی' }] },
        ],
      },
    });
    expect(article.bodyMd).toBe('## عنوان بخش\n\nمتن آزمایشی');

    const updated = await updateArticle(article.id, {
      bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'متن تازه' }] }] },
    });
    expect(updated?.bodyMd).toBe('متن تازه');
    expect(updated?.bodyJson?.content).toHaveLength(1);
  });

  it('clears the mirror when the body is emptied, rather than leaving stale prose behind', async () => {
    const article = await createArticle({
      slug: `cleared-${Date.now()}`,
      type: 'blog',
      title: 'تست',
      bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'قبلی' }] }] },
    });
    const updated = await updateArticle(article.id, { bodyJson: { type: 'doc', content: [] } });
    expect(updated?.bodyMd).toBe('');
  });

  it('leaves an explicit markdown-only write alone (the legacy path)', async () => {
    const article = await createArticle({
      slug: `legacy-${Date.now()}`,
      type: 'blog',
      title: 'تست',
      bodyMd: '## دستی',
    });
    expect(article.bodyMd).toBe('## دستی');
    expect(article.bodyJson).toBeNull();
  });
});
