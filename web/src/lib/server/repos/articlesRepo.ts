/**
 * Articles — blog/news with the AI-draft → editor approval gate.
 * Public reads only expose published items whose publishAt has passed.
 */
import { and, desc, eq, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { articles } from '@/lib/server/db/schema';
import type { Article } from '@/lib/types/domain';

type Row = typeof articles.$inferSelect;

export function toArticleDto(r: Row): Article {
  return {
    id: r.id,
    slug: r.slug,
    type: r.type,
    title: r.title,
    excerpt: r.excerpt ?? undefined,
    status: r.status,
    source: r.source,
    publishAt: r.publishAt?.toISOString(),
    seo: r.seo ?? undefined,
  };
}

/** Body included — for the article page and the admin editor. */
export type ArticleFull = Article & { bodyMd: string; coverUrl?: string };

export function toArticleFull(r: Row): ArticleFull {
  return { ...toArticleDto(r), bodyMd: r.bodyMd, coverUrl: r.coverUrl ?? undefined };
}

function publishedCond() {
  return and(
    eq(articles.status, 'published'),
    or(isNull(articles.publishAt), lte(articles.publishAt, new Date())),
  );
}

export async function listPublished(type: 'blog' | 'news', page = 1, perPage = 20) {
  const db = getDb();
  const where = and(eq(articles.type, type), publishedCond());
  const rows = await db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.publishAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(articles).where(where);
  return { articles: rows.map(toArticleDto), total: total[0]?.n ?? 0 };
}

export async function findPublishedBySlug(slug: string): Promise<ArticleFull | null> {
  const rows = await getDb()
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), publishedCond()))
    .limit(1);
  return rows[0] ? toArticleFull(rows[0]) : null;
}

export async function searchArticles(q: string, limit = 10): Promise<Article[]> {
  const term = `%${q.trim()}%`;
  const rows = await getDb()
    .select()
    .from(articles)
    .where(and(publishedCond(), or(ilike(articles.title, term), ilike(articles.excerpt, term))))
    .orderBy(desc(articles.publishAt))
    .limit(limit);
  return rows.map(toArticleDto);
}

/** Related articles for a SKU/category context (simple recency fallback). */
export async function recentPublished(limit = 4): Promise<Article[]> {
  const rows = await getDb()
    .select()
    .from(articles)
    .where(publishedCond())
    .orderBy(desc(articles.publishAt))
    .limit(limit);
  return rows.map(toArticleDto);
}

/* --------------------------- admin (content) --------------------------- */

export async function adminListArticles(query: { status?: Row['status']; type?: Row['type']; page?: number; perPage?: number }) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const conds = [];
  if (query.status) conds.push(eq(articles.status, query.status));
  if (query.type) conds.push(eq(articles.type, query.type));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.updatedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(articles).where(where);
  return { articles: rows.map(toArticleFull), total: total[0]?.n ?? 0 };
}

export async function adminGetArticle(id: string): Promise<ArticleFull | null> {
  const rows = await getDb().select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0] ? toArticleFull(rows[0]) : null;
}

export async function createArticle(input: {
  slug: string;
  type: 'blog' | 'news';
  title: string;
  excerpt?: string;
  bodyMd?: string;
  source?: 'ai' | 'human';
  authorId?: string;
}): Promise<ArticleFull> {
  const rows = await getDb()
    .insert(articles)
    .values({
      id: ulid(),
      slug: input.slug,
      type: input.type,
      title: input.title,
      excerpt: input.excerpt ?? null,
      bodyMd: input.bodyMd ?? '',
      source: input.source ?? 'human',
      authorId: input.authorId ?? null,
      status: 'draft',
    })
    .returning();
  return toArticleFull(rows[0]!);
}

export async function updateArticle(
  id: string,
  patch: Partial<{
    slug: string;
    title: string;
    excerpt: string | null;
    bodyMd: string;
    coverUrl: string | null;
    status: Row['status'];
    publishAt: Date | null;
    approvedBy: string | null;
    seo: Row['seo'];
  }>,
): Promise<ArticleFull | null> {
  const rows = await getDb()
    .update(articles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  return rows[0] ? toArticleFull(rows[0]) : null;
}

/** Publish-job body: scheduled articles whose time has come → published. */
export async function publishDueArticles(): Promise<number> {
  const rows = await getDb()
    .update(articles)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(articles.status, 'scheduled'), lte(articles.publishAt, new Date())))
    .returning({ id: articles.id });
  return rows.length;
}
