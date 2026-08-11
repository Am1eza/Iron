/**
 * Reader comments on an article (US-14.8) — moderated: every comment is
 * born `pending`; only `moderateComment('approved', ...)` makes it visible
 * on the public page. See `content.ts`'s `articleComments` for the schema
 * and the full reasoning.
 *
 * US-14.9 (the comments-UX redesign) added "این نظر مفید بود؟" voting and
 * an "خریدار تایید‌شده آهن‌تایم" trust badge — see `listApprovedComments`.
 * Combined in JS from a few flat queries rather than one wide join: this is
 * a low-traffic B2B blog (dozens of comments per article, not thousands),
 * so the extra round trips cost nothing real, and three queries you can
 * read independently are worth more here than one clever one you can't.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { articleComments, articles, users, commentHelpfulVotes, orders } from '@/lib/server/db/schema';

export type CommentStatus = 'pending' | 'approved' | 'rejected';

export type PublicComment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  /** Has at least one order on file — the "خریدار تایید‌شده آهن‌تایم" badge.
   *  Computed fresh on every read, not frozen at comment time: a customer's
   *  first order after commenting should light the badge up on their past
   *  comments too, the same way a review site would. */
  isVerifiedBuyer: boolean;
  helpfulCount: number;
  /** Only meaningful when the list was fetched for a signed-in viewer;
   *  `false` for an anonymous visitor, never a tri-state, since anyone
   *  who cannot vote has definitionally not voted. */
  helpfulByMe: boolean;
};

export type AdminComment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  status: CommentStatus;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  articleType: 'blog' | 'news';
  authorMobile: string | null;
};

export async function createComment(input: {
  articleId: string;
  userId: string;
  body: string;
}): Promise<{ id: string; status: CommentStatus }> {
  const rows = await getDb()
    .insert(articleComments)
    .values({ id: ulid(), articleId: input.articleId, userId: input.userId, body: input.body })
    .returning({ id: articleComments.id, status: articleComments.status });
  return rows[0]!;
}

/** Approved comments for one article — the public page's own read. A
 *  deactivated/deleted commenter's name is dropped (`authorName: null`),
 *  never the comment itself — matching `articles.authorId`'s own "preserve
 *  content, drop the person" pattern. `viewerId` is the CURRENT visitor
 *  (from `getSessionVerified()` in the page, not the comment's own author) —
 *  omit it for an anonymous visitor, in which case every `helpfulByMe` is
 *  `false`. Default order is oldest-first; "پرمفیدترین" is a client-side
 *  re-sort of this same array (see `CommentsSection.tsx`), not a second
 *  query — every row already carries `helpfulCount`. */
export async function listApprovedComments(articleId: string, viewerId?: string): Promise<PublicComment[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: articleComments.id,
      body: articleComments.body,
      createdAt: articleComments.createdAt,
      authorName: users.name,
      authorId: articleComments.userId,
    })
    .from(articleComments)
    .leftJoin(users, eq(articleComments.userId, users.id))
    .where(and(eq(articleComments.articleId, articleId), eq(articleComments.status, 'approved')))
    .orderBy(articleComments.createdAt);

  if (rows.length === 0) return [];

  const commentIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter((id): id is string => id !== null))];

  const [counts, myVotes, buyerIds] = await Promise.all([
    db
      .select({ commentId: commentHelpfulVotes.commentId, n: sql<number>`count(*)::int` })
      .from(commentHelpfulVotes)
      .where(inArray(commentHelpfulVotes.commentId, commentIds))
      .groupBy(commentHelpfulVotes.commentId),
    viewerId
      ? db
          .select({ commentId: commentHelpfulVotes.commentId })
          .from(commentHelpfulVotes)
          .where(and(inArray(commentHelpfulVotes.commentId, commentIds), eq(commentHelpfulVotes.userId, viewerId)))
      : Promise.resolve([]),
    authorIds.length > 0
      ? db
          .select({ userId: orders.userId })
          .from(orders)
          .where(inArray(orders.userId, authorIds))
      : Promise.resolve([]),
  ]);

  const countByComment = new Map(counts.map((c) => [c.commentId, c.n]));
  const votedByMe = new Set(myVotes.map((v) => v.commentId));
  const verifiedAuthors = new Set(buyerIds.map((b) => b.userId).filter((id): id is string => id !== null));

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    authorName: r.authorName,
    isVerifiedBuyer: r.authorId !== null && verifiedAuthors.has(r.authorId),
    helpfulCount: countByComment.get(r.id) ?? 0,
    helpfulByMe: votedByMe.has(r.id),
  }));
}

/** Toggle "این نظر مفید بود؟" for one viewer — insert if absent, delete if
 *  present, so a double-click can never double-count. Returns the count
 *  AFTER the toggle so the client can reconcile its optimistic update
 *  against the real number in one round trip. */
export async function toggleHelpfulVote(commentId: string, userId: string): Promise<{ voted: boolean; count: number }> {
  const db = getDb();
  const existing = await db
    .select({ id: commentHelpfulVotes.id })
    .from(commentHelpfulVotes)
    .where(and(eq(commentHelpfulVotes.commentId, commentId), eq(commentHelpfulVotes.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(commentHelpfulVotes).where(eq(commentHelpfulVotes.id, existing[0]!.id));
  } else {
    await db.insert(commentHelpfulVotes).values({ id: ulid(), commentId, userId });
  }

  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(commentHelpfulVotes)
    .where(eq(commentHelpfulVotes.commentId, commentId));
  return { voted: existing.length === 0, count: rows[0]?.n ?? 0 };
}

/**
 * The moderation queue. Unfiltered ("all") ordering puts every `pending`
 * row first — that is the actual work an admin opening this page has, and
 * burying it under already-decided rows (sorted purely by recency) would
 * mean a newly-approved comment on a popular article hides a week-old
 * unreviewed one. Newest-first within each bucket.
 */
export async function listCommentsForModeration(status?: CommentStatus): Promise<AdminComment[]> {
  const db = getDb();
  const where = status ? eq(articleComments.status, status) : undefined;
  const pendingFirst = sql`case when ${articleComments.status} = 'pending' then 0 else 1 end`;
  const rows = await db
    .select({
      id: articleComments.id,
      body: articleComments.body,
      status: articleComments.status,
      createdAt: articleComments.createdAt,
      articleId: articleComments.articleId,
      articleTitle: articles.title,
      articleSlug: articles.slug,
      articleType: articles.type,
      authorName: users.name,
      authorMobile: users.mobile,
    })
    .from(articleComments)
    .innerJoin(articles, eq(articleComments.articleId, articles.id))
    .leftJoin(users, eq(articleComments.userId, users.id))
    .where(where)
    .orderBy(pendingFirst, desc(articleComments.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function moderateComment(
  id: string,
  status: 'approved' | 'rejected',
  moderatorId: string,
): Promise<boolean> {
  const rows = await getDb()
    .update(articleComments)
    .set({ status, moderatedBy: moderatorId, moderatedAt: new Date() })
    .where(eq(articleComments.id, id))
    .returning({ id: articleComments.id });
  return rows.length > 0;
}

export async function deleteComment(id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(articleComments)
    .where(eq(articleComments.id, id))
    .returning({ id: articleComments.id });
  return rows.length > 0;
}

/** Pending-comment count — cheap enough to run on its own, kept separate
 *  from `listCommentsForModeration` so a caller that only needs the count
 *  (e.g. a future nav badge) never pays for the two joins. */
export async function pendingCommentCount(): Promise<number> {
  const rows = await getDb()
    .select({ id: articleComments.id })
    .from(articleComments)
    .where(eq(articleComments.status, 'pending'));
  return rows.length;
}
