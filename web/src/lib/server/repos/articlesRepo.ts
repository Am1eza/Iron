/**
 * Articles — blog/news with the AI-draft → editor approval gate.
 * Public reads only expose published items whose publishAt has passed.
 */
import { and, desc, eq, ilike, isNull, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { articles } from '@/lib/server/db/schema';
import type { Article } from '@/lib/types/domain';
import type { RichDoc } from '@/lib/content/richDoc';
import { docToMarkdown } from '@/lib/content/docToMarkdown';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { likeContains } from '@/lib/server/utils/likeEscape';
import { PER_PAGE } from '@/lib/content/archivePaging';

type Row = typeof articles.$inferSelect;

export function toArticleDto(r: Row): Article {
  return {
    id: r.id,
    slug: r.slug,
    type: r.type,
    title: r.title,
    excerpt: r.excerpt ?? undefined,
    coverUrl: r.coverUrl ?? undefined,
    status: r.status,
    source: r.source,
    publishAt: r.publishAt?.toISOString(),
    // notNull + defaultNow in the schema, so no null branch. Every PATCH
    // stamps it — including SEO-only edits, which is what the column means.
    updatedAt: r.updatedAt.toISOString(),
    // The column is nullable with no default, so an article written before the
    // tags migration reads back `null` while one saved with the chip input
    // cleared reads back `[]` — the same thing, "untagged". Collapsing them
    // here means no caller ever writes `article.tags?.length` and no caller
    // ever gets it wrong.
    tags: r.tags ?? [],
    seo: r.seo ?? undefined,
  };
}

/** Body (+ byline) included — for the article page and the admin editor. */
export type ArticleFull = Article & { bodyMd: string; bodyJson: RichDoc | null; authorId?: string | null };

export function toArticleFull(r: Row): ArticleFull {
  return { ...toArticleDto(r), bodyMd: r.bodyMd, bodyJson: r.bodyJson ?? null, authorId: r.authorId ?? null };
}

/**
 * `body_md` is DERIVED, never authored (US-12.4).
 *
 * The derivation lives here rather than in the route handler on purpose: the
 * two columns going out of sync would mean an article that reads one way to a
 * visitor and another way to site search, the AI advisor and the SEO report.
 * Putting it at the only two write paths makes that impossible for any future
 * caller, including a background job or an AI draft generator that has never
 * heard of `docToMarkdown`.
 *
 * An explicit `bodyMd` in the patch is still honoured when no `bodyJson`
 * accompanies it — that is the legacy/never-opened-in-the-editor path.
 */
function withDerivedBody<T extends { bodyJson?: RichDoc | null; bodyMd?: string }>(patch: T): T {
  if (patch.bodyJson === undefined) return patch;
  return { ...patch, bodyMd: patch.bodyJson ? docToMarkdown(patch.bodyJson) : '' };
}

function publishedCond() {
  return and(
    eq(articles.status, 'published'),
    or(isNull(articles.publishAt), lte(articles.publishAt, new Date())),
  );
}

/** A slug collision, translated into something the editor's form can show.
 *  `articles.slug` is unique GLOBALLY — across blog and news both — so reusing
 *  a news slug for a blog post collides, which is easy to do by accident. */
export class DuplicateArticleSlugError extends Error {
  readonly field = 'slug' as const;
  constructor() {
    super('این نشانی قبلاً برای مقالهٔ دیگری استفاده شده است.');
    this.name = 'DuplicateArticleSlugError';
  }
}

/** Postgres unique_violation — node-postgres puts the SQLSTATE on `.code`. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function asSlugConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateArticleSlugError();
    throw err;
  }
}

/**
 * The columns `toArticleDto` actually reads. `db.select()` with no projection
 * pulled `body_md` AND `body_json` — the full ProseMirror document — out of
 * Postgres to render cards that show a title, an excerpt and a date, and then
 * discarded ~99% of it. Invisible at 7 short articles; the sitemap and RSS
 * paths page up to 50x200 rows through this, so at a few hundred articles with
 * real editor content (images, tables, chart nodes) it is megabytes per call,
 * once per worker per memo window.
 */
const LIST_COLUMNS = {
  id: articles.id,
  slug: articles.slug,
  type: articles.type,
  title: articles.title,
  excerpt: articles.excerpt,
  coverUrl: articles.coverUrl,
  status: articles.status,
  source: articles.source,
  publishAt: articles.publishAt,
  updatedAt: articles.updatedAt,
  tags: articles.tags,
  seo: articles.seo,
} as const;

type ListRow = { [K in keyof typeof LIST_COLUMNS]: Row[K] };

/** `toArticleDto` reads exactly these columns — see LIST_COLUMNS. */
function listRowToDto(r: ListRow): Article {
  return toArticleDto(r as Row);
}

export async function listPublished(type: 'blog' | 'news', page = 1, perPage = 20) {
  const db = getDb();
  const where = and(eq(articles.type, type), publishedCond());
  const [rows, total] = await Promise.all([
    db
      .select(LIST_COLUMNS)
      .from(articles)
      .where(where)
      .orderBy(desc(articles.publishAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(articles).where(where),
  ]);
  return { articles: rows.map(listRowToDto), total: total[0]?.n ?? 0 };
}

/**
 * The "مطالب مرتبط" strip under an article.
 *
 * The page used to call `getArticlesByType()`, which runs `listPublished` —
 * i.e. TWO queries returning twenty fully-hydrated rows (bodies included) —
 * and then `.filter().slice(0, 3)` them down to three title-only cards, while
 * throwing away the `count(*)` it had just paid for. One projected query, three
 * skinny rows.
 *
 * "Related" here is recency, exactly as before: making it genuinely related
 * (shared category / tag overlap, both already in the schema) is a product
 * change, not a performance fix, and is deliberately out of scope here.
 */
export async function relatedArticles(
  type: 'blog' | 'news',
  excludeSlug: string,
  limit = 3,
): Promise<Article[]> {
  const rows = await getDb()
    .select(LIST_COLUMNS)
    .from(articles)
    .where(and(eq(articles.type, type), ne(articles.slug, excludeSlug), publishedCond()))
    .orderBy(desc(articles.publishAt))
    .limit(limit);
  return rows.map(listRowToDto);
}

/**
 * `/blog/{slug}` and `/news/{slug}` for every article the public can actually
 * read — same `publishedCond()` the detail page uses, so a draft or a
 * scheduled-but-not-yet-due article is (correctly) not in the list and its URL
 * 404s. Slug-only, no body: this is read from middleware on a 60s cache.
 */
export async function publishedArticlePaths(): Promise<string[]> {
  const rows = await getDb()
    .select({ slug: articles.slug, type: articles.type })
    .from(articles)
    .where(publishedCond());
  const paths = rows.map((r) => `/${r.type}/${r.slug}`);
  // The archive pages that actually exist, so `/blog/page/999` can be answered
  // with a genuine 404 by the middleware guard instead of a cacheable 200
  // that claims the blog is empty. Page 1 is `/blog` and is a static route,
  // so the list starts at 2.
  for (const type of ['blog', 'news'] as const) {
    const pageCount = Math.ceil(rows.filter((r) => r.type === type).length / PER_PAGE);
    for (let n = 2; n <= pageCount; n += 1) paths.push(`/${type}/page/${n}`);
  }
  return paths;
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
  const term = likeContains(q.trim());
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
        const term = likeContains(v);
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

export async function adminListArticles(query: {
  status?: Row['status'];
  type?: Row['type'];
  q?: string;
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  const page = Math.min(100_000, Math.max(1, Math.floor(Number.isFinite(query.page) ? (query.page as number) : 1)));
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 50)));
  const conds = [];
  if (query.status) conds.push(eq(articles.status, query.status));
  if (query.type) conds.push(eq(articles.type, query.type));
  if (query.q) {
    // Covers the whole point of "find any article easily": the admin might
    // remember a phrase from the body, not just the title or slug.
    const term = likeContains(query.q.trim().slice(0, 100));
    conds.push(
      or(ilike(articles.title, term), ilike(articles.slug, term), ilike(articles.excerpt, term), ilike(articles.bodyMd, term)),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(where)
      .orderBy(desc(articles.updatedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(articles).where(where),
  ]);
  return { articles: rows.map(toArticleFull), total: total[0]?.n ?? 0 };
}

export async function adminGetArticle(id: string): Promise<ArticleFull | null> {
  const rows = await getDb().select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0] ? toArticleFull(rows[0]) : null;
}

/**
 * Hard-deletes a DRAFT article only (US-12.5) — never published/scheduled:
 * once an article has been (or is about to be) public, "delete" means
 * unpublish (PATCH status:'draft'), not erase — the same soft-vs-hard split
 * the rest of the catalog uses for priced history, just expressed through
 * status instead of a deletedAt/isActive column (an article never carries
 * transactional history the way a priced SKU does, so this is deliberately
 * simpler than a full soft-delete). Returns false if the row doesn't exist
 * or isn't a draft — the caller turns that into a 400/404.
 */
export async function deleteDraftArticle(id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(articles)
    .where(and(eq(articles.id, id), eq(articles.status, 'draft')))
    .returning({ id: articles.id });
  return rows.length > 0;
}

export async function createArticle(input: {
  slug: string;
  type: 'blog' | 'news';
  title: string;
  excerpt?: string;
  bodyMd?: string;
  bodyJson?: RichDoc | null;
  source?: 'ai' | 'human';
  authorId?: string;
  tags?: string[];
}): Promise<ArticleFull> {
  const body = withDerivedBody({ bodyJson: input.bodyJson, bodyMd: input.bodyMd });
  const rows = await asSlugConflict(() =>
    getDb()
    .insert(articles)
    .values({
      id: ulid(),
      slug: input.slug,
      type: input.type,
      title: input.title,
      excerpt: input.excerpt ?? null,
      bodyMd: body.bodyMd ?? '',
      bodyJson: body.bodyJson ?? null,
      source: input.source ?? 'human',
      authorId: input.authorId ?? null,
      tags: input.tags ?? null,
      status: 'draft',
    })
    .returning(),
  );
  return toArticleFull(rows[0]!);
}

export async function updateArticle(
  id: string,
  patch: Partial<{
    slug: string;
    // Moving a misfiled post between blog and news used to require deleting
    // and recreating it — and DELETE refuses anything already published.
    type: 'blog' | 'news';
    title: string;
    excerpt: string | null;
    bodyMd: string;
    bodyJson: RichDoc | null;
    coverUrl: string | null;
    status: Row['status'];
    publishAt: Date | null;
    approvedBy: string | null;
    authorId: string | null;
    tags: string[];
    seo: Row['seo'];
  }>,
): Promise<ArticleFull | null> {
  const rows = await asSlugConflict(() =>
    getDb()
      .update(articles)
      .set({ ...withDerivedBody(patch), updatedAt: new Date() })
      .where(eq(articles.id, id))
      .returning(),
  );
  return rows[0] ? toArticleFull(rows[0]) : null;
}

/**
 * Publish-job body: scheduled articles whose time has come → published.
 * Requires approvedBy IS NOT NULL as defense-in-depth for the approval
 * gate — only POST .../publish ever sets it, so this can never auto-live
 * an article that skipped that endpoint, even if some other write path
 * manages to set status='scheduled' directly in the future.
 */
export async function publishDueArticles(): Promise<{ type: 'blog' | 'news'; slug: string }[]> {
  // Returns WHAT was published, not just how many: /blog and /news are now
  // genuinely ISR-cached, so the caller has to purge their caches or a
  // scheduled article waits up to 10 minutes to appear. Its own detail URL is
  // the sharper edge — anyone (a crawler following a pre-announced link, the
  // editor previewing) who hits it before the publish time caches a
  // `notFound()` for that route's revalidate window, so the article can 404
  // for minutes AFTER it goes live.
  const rows = await getDb()
    .update(articles)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(articles.status, 'scheduled'), lte(articles.publishAt, new Date()), isNotNull(articles.approvedBy)))
    .returning({ type: articles.type, slug: articles.slug });
  return rows;
}
