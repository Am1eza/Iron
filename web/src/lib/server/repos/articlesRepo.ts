/**
 * Articles — blog/news with the AI-draft → editor approval gate.
 * Public reads only expose published items whose publishAt has passed.
 */
import { and, desc, eq, ilike, isNull, isNotNull, lte, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { articles } from '@/lib/server/db/schema';
import type { Article } from '@/lib/types/domain';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';

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

/**
 * AI advisor's guide search (searchGuides tool) — same ilike/pg_trgm approach
 * as catalogRepo.searchSkus, but over PUBLISHED articles only and including
 * the body (a knowledge question's keywords often live in the prose, not the
 * title). Tokens are matched with OR in SQL (each token against title/excerpt
 * /body in Persian AND Latin digit spellings) and the MAJORITY-match filter
 * runs in JS: «فرق A2 و A3» must find the grade guide via A2+A3 even though
 * «فرق» appears nowhere, while a query whose tokens mostly match nothing
 * returns [] so the model can honestly say no guide exists — a token-AND gate
 * (searchSkus' shape) had exactly that false-negative on the canonical
 * question. pg_trgm similarity on the title stays the SQL-side ranking.
 */
export async function searchPublishedGuides(q: string, limit = 3): Promise<ArticleFull[]> {
  const trimmed = q.trim();
  // Single-char tokens are stop-words in this domain («و», «یا») — drop them.
  const tokens = [...new Set(trimmed.split(/\s+/).filter((t) => t.length >= 2))];
  if (tokens.length === 0) return [];
  const variantsOf = (token: string) => [...new Set([token, normalizeDigits(token), toPersianDigits(token)])];
  const anyToken = or(
    ...tokens.flatMap((token) =>
      variantsOf(token).flatMap((v) => {
        const term = `%${v}%`;
        return [ilike(articles.title, term), ilike(articles.excerpt, term), ilike(articles.bodyMd, term)];
      }),
    ),
  );
  const rows = await getDb()
    .select()
    .from(articles)
    .where(and(publishedCond(), anyToken))
    .orderBy(desc(sql`similarity(${articles.title}, ${trimmed})`), desc(articles.publishAt))
    .limit(24);
  const matchCount = (r: Row) => {
    const hay = normalizeDigits(`${r.title}\n${r.excerpt ?? ''}\n${r.bodyMd}`).toLowerCase();
    return tokens.filter((t) => hay.includes(normalizeDigits(t).toLowerCase())).length;
  };
  const threshold = Math.ceil(tokens.length / 2);
  return rows
    .map((r) => ({ r, score: matchCount(r) }))
    .filter(({ score }) => score >= threshold)
    // Stable sort: majority score first, then the SQL similarity order.
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => toArticleFull(r));
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

/**
 * Publish-job body: scheduled articles whose time has come → published.
 * Requires approvedBy IS NOT NULL as defense-in-depth for the approval
 * gate — only POST .../publish ever sets it, so this can never auto-live
 * an article that skipped that endpoint, even if some other write path
 * manages to set status='scheduled' directly in the future.
 */
export async function publishDueArticles(): Promise<number> {
  const rows = await getDb()
    .update(articles)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(articles.status, 'scheduled'), lte(articles.publishAt, new Date()), isNotNull(articles.approvedBy)))
    .returning({ id: articles.id });
  return rows.length;
}
