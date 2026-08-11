// @vitest-environment node
/**
 * Comment moderation (US-14.8) — real Postgres (pglite) since this exercises
 * real FKs (article_id/user_id/moderated_by → articles/users) and ordering,
 * same reasoning as this directory's other `.pg.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  createComment,
  listApprovedComments,
  listCommentsForModeration,
  moderateComment,
  pendingCommentCount,
} from './commentsRepo';

let db: Db;
let close: () => Promise<void>;

const ARTICLE_ID = 'art-1';
const USER_ID = 'user-1';
const MODERATOR_ID = 'mod-1';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.articles).values({
    id: ARTICLE_ID,
    slug: 'test-article',
    type: 'blog',
    title: 'مقالهٔ تست',
    bodyMd: '',
    status: 'published',
    source: 'human',
    publishAt: new Date('2026-01-01T00:00:00Z'),
  });
  await db.insert(schema.users).values([
    { id: USER_ID, mobile: '09120000001', name: 'کاربر آزمایشی', role: 'customer' },
    { id: MODERATOR_ID, mobile: '09120000002', name: 'ادمین آزمایشی', role: 'admin' },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('createComment + listApprovedComments', () => {
  it('a fresh comment is pending and invisible to the public list', async () => {
    const { id, status } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر اول' });
    expect(status).toBe('pending');
    const approved = await listApprovedComments(ARTICLE_ID);
    expect(approved.some((c) => c.id === id)).toBe(false);
  });

  it('an approved comment appears in the public list with the author name', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر دوم' });
    await moderateComment(id, 'approved', MODERATOR_ID);
    const approved = await listApprovedComments(ARTICLE_ID);
    const found = approved.find((c) => c.id === id);
    expect(found).toBeDefined();
    expect(found!.authorName).toBe('کاربر آزمایشی');
  });

  it('a rejected comment never appears in the public list', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر سوم' });
    await moderateComment(id, 'rejected', MODERATOR_ID);
    const approved = await listApprovedComments(ARTICLE_ID);
    expect(approved.some((c) => c.id === id)).toBe(false);
  });
});

describe('listCommentsForModeration', () => {
  it('filters by status when given one', async () => {
    const rejected = await listCommentsForModeration('rejected');
    expect(rejected.every((c) => c.status === 'rejected')).toBe(true);
    expect(rejected.length).toBeGreaterThan(0);
  });

  it('joins the article title/slug/type so the admin never has to look it up separately', async () => {
    const rows = await listCommentsForModeration('rejected');
    expect(rows[0]!.articleTitle).toBe('مقالهٔ تست');
    expect(rows[0]!.articleSlug).toBe('test-article');
    expect(rows[0]!.articleType).toBe('blog');
  });
});

describe('moderateComment', () => {
  it('returns false for a comment id that does not exist', async () => {
    const ok = await moderateComment('no-such-id', 'approved', MODERATOR_ID);
    expect(ok).toBe(false);
  });
});

describe('pendingCommentCount', () => {
  it('counts only pending comments', async () => {
    await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'یک نظر منتظر' });
    const count = await pendingCommentCount();
    const all = await listCommentsForModeration();
    const pendingInAll = all.filter((c) => c.status === 'pending').length;
    expect(count).toBe(pendingInAll);
    expect(count).toBeGreaterThan(0);
  });
});
