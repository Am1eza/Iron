/**
 * Reader comments on an article (US-14.8) — moderated: every comment is
 * born `pending`; only `moderateComment('approved', ...)` makes it visible
 * on the public page. See `content.ts`'s `articleComments` for the schema
 * and the full reasoning.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { articleComments, articles, users } from '@/lib/server/db/schema';

export type CommentStatus = 'pending' | 'approved' | 'rejected';

export type PublicComment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
};

export type AdminComment = PublicComment & {
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

/** Approved comments for one article, oldest first — the public page's own
 *  read. A deactivated/deleted commenter's name is dropped (`authorName:
 *  null`), never the comment itself — matching `articles.authorId`'s own
 *  "preserve content, drop the person" pattern. */
export async function listApprovedComments(articleId: string): Promise<PublicComment[]> {
  const rows = await getDb()
    .select({
      id: articleComments.id,
      body: articleComments.body,
      createdAt: articleComments.createdAt,
      authorName: users.name,
    })
    .from(articleComments)
    .leftJoin(users, eq(articleComments.userId, users.id))
    .where(and(eq(articleComments.articleId, articleId), eq(articleComments.status, 'approved')))
    .orderBy(articleComments.createdAt);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
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
