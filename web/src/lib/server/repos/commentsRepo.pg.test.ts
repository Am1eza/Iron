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
  toggleHelpfulVote,
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


describe('listApprovedComments — helpful votes and verified-buyer badge (US-14.9)', () => {
  it('a user with no orders is not a verified buyer', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر بدون سفارش' });
    await moderateComment(id, 'approved', MODERATOR_ID);
    const approved = await listApprovedComments(ARTICLE_ID);
    const found = approved.find((c) => c.id === id);
    expect(found!.isVerifiedBuyer).toBe(false);
  });

  it('the badge is computed fresh per read, not frozen at comment time: placing an order AFTER commenting still lights it up', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر قبل از سفارش' });
    await moderateComment(id, 'approved', MODERATOR_ID);

    const before = await listApprovedComments(ARTICLE_ID);
    expect(before.find((c) => c.id === id)!.isVerifiedBuyer).toBe(false);

    await db.insert(schema.orders).values({ id: 'order-1', ref: 'ORD-TEST-1', userId: USER_ID });

    const after = await listApprovedComments(ARTICLE_ID);
    expect(after.find((c) => c.id === id)!.isVerifiedBuyer).toBe(true);
  });

  it('helpfulByMe is false for an anonymous read and reflects a real vote for a signed-in one', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر برای رأی' });
    await moderateComment(id, 'approved', MODERATOR_ID);

    const anonymous = await listApprovedComments(ARTICLE_ID);
    expect(anonymous.find((c) => c.id === id)!.helpfulByMe).toBe(false);

    await toggleHelpfulVote(id, MODERATOR_ID);
    const asVoter = await listApprovedComments(ARTICLE_ID, MODERATOR_ID);
    const voted = asVoter.find((c) => c.id === id)!;
    expect(voted.helpfulByMe).toBe(true);
    expect(voted.helpfulCount).toBe(1);

    // A different viewer sees the count but not the "by me" flag.
    const asOther = await listApprovedComments(ARTICLE_ID, USER_ID);
    const seenByOther = asOther.find((c) => c.id === id)!;
    expect(seenByOther.helpfulByMe).toBe(false);
    expect(seenByOther.helpfulCount).toBe(1);
  });
});

describe('toggleHelpfulVote', () => {
  it('toggles on then off — a second call removes the vote instead of adding a second one', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر برای تاگل' });
    await moderateComment(id, 'approved', MODERATOR_ID);

    const first = await toggleHelpfulVote(id, USER_ID);
    expect(first).toEqual({ voted: true, count: 1 });

    const second = await toggleHelpfulVote(id, USER_ID);
    expect(second).toEqual({ voted: false, count: 0 });
  });

  it('two different viewers voting both count', async () => {
    const { id } = await createComment({ articleId: ARTICLE_ID, userId: USER_ID, body: 'نظر برای دو رأی' });
    await moderateComment(id, 'approved', MODERATOR_ID);

    await toggleHelpfulVote(id, USER_ID);
    const result = await toggleHelpfulVote(id, MODERATOR_ID);
    expect(result).toEqual({ voted: true, count: 2 });
  });
});
