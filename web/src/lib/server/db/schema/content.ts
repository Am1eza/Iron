/**
 * Content — articles (blog/news with the AI-draft → editor approval gate)
 * and brand/customer logos.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import type { SeoMeta } from '@/lib/types/domain';
import type { RichDoc } from '@/lib/content/richDoc';

export const ARTICLE_TYPES = ['blog', 'news'] as const;
export const ARTICLE_STATUSES = ['draft', 'scheduled', 'published'] as const;
export const ARTICLE_SOURCES = ['ai', 'human'] as const;
export const COMMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const articles = pgTable(
  'articles',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    type: text('type', { enum: ARTICLE_TYPES }).notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    /**
     * DERIVED from `bodyJson` on every write (`articlesRepo.updateArticle` →
     * `docToMarkdown`). Kept as a real column, not computed on read, because
     * three things query it directly and one of them is a GIN trigram index:
     * the content queue's body search, `searchPublishedGuides` (the AI
     * advisor's grounding) and `analyticsRepo.seoStats`' word count. It is
     * also the disaster-recovery copy — a row whose `body_json` is lost still
     * renders through the legacy markdown path.
     */
    bodyMd: text('body_md').notNull().default(''),
    /**
     * The structured article body (US-12.4) — ProseMirror/Tiptap document
     * JSON, validated against `richDocSchema` at the API boundary so no node
     * type outside that whitelist can ever be stored. Nullable: a row written
     * before the structured editor shipped has `null` here and renders by
     * parsing `body_md`, which is what makes the migration a no-op rather than
     * a flag day. Not indexed — nothing queries INTO the body; the searchable
     * projection is `body_md` above.
     */
    bodyJson: jsonb('body_json').$type<RichDoc>(),
    coverUrl: text('cover_url'),
    status: text('status', { enum: ARTICLE_STATUSES }).notNull().default('draft'),
    source: text('source', { enum: ARTICLE_SOURCES }).notNull().default('human'),
    // Articles are content, not user-owned — preserve them, just drop the
    // reference to a since-deleted author/approver account.
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    relatedSkuIds: jsonb('related_sku_ids').$type<string[]>(),
    relatedCategoryIds: jsonb('related_category_ids').$type<string[]>(),
    /**
     * Market-news topic slugs (اخبار بازار), news-only in practice —
     * see lib/data/newsTopics.ts for the fixed, code-defined taxonomy
     * these values are validated against. A separate column rather than
     * reusing relatedCategoryIds: a category is a product
     * (میلگرد/ورق/…), a topic is a kind of market news (نرخ/تولید/…) —
     * conflating the two id spaces would let a stale category id match a
     * same-shaped topic id by accident.
     */
    relatedNewsTopicIds: jsonb('related_news_topic_ids').$type<string[]>(),
    /** Admin-editable Q&A (US-14.7) — rendered as a visible FAQ section
     *  plus a schema.org FAQPage JSON-LD block on every article page
     *  (blog and news both), the same AEO mechanism already shipped for
     *  /tools/project (`lib/seo.faqJsonLd`). Nullable/empty means no FAQ
     *  section renders — never a fabricated placeholder question. */
    faq: jsonb('faq').$type<{ question: string; answer: string }[]>(),
    // Editorial labels. A flat `string[]` rather than a join table for the same
    // reason as the two columns above: a tag has no attributes, no ordering and
    // no per-tag metadata, so a join table would buy only cheap renaming at the
    // cost of a repo, a migration and an N+1 on every list read. Nullable with
    // no default — `null` and `[]` both mean untagged, and `toArticleDto`
    // normalises both to `[]` so no consumer ever has to know the difference.
    tags: jsonb('tags').$type<string[]>(),
    seo: jsonb('seo').$type<SeoMeta>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('articles_status_publish_idx').on(t.status, t.publishAt),
    index('articles_type_status_idx').on(t.type, t.status),
    // Trigram indexes — searchArticles/searchPublishedGuides (articlesRepo,
    // used by /api/search and the AI advisor's searchGuides tool) run
    // leading-wildcard `ilike()` + `similarity()` ORDER BY over these columns,
    // which only a GIN trigram index (not a plain btree) can serve.
    index('articles_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    index('articles_excerpt_trgm_idx').using('gin', sql`${t.excerpt} gin_trgm_ops`),
    index('articles_body_trgm_idx').using('gin', sql`${t.bodyMd} gin_trgm_ops`),
    // `jsonb_path_ops` rather than the default `jsonb_ops`: containment
    // (`tags @> '["میلگرد"]'`) is the only query this index will ever serve,
    // and jsonb_path_ops indexes just the hashed path+value, making it both
    // smaller and faster for exactly that. It cannot serve key-existence
    // (`?`) queries — which a `string[]` column has no use for anyway.
    index('articles_tags_idx').using('gin', sql`${t.tags} jsonb_path_ops`),
    // FKs with no covering index (W29) — both `users` ON DELETE SET NULL.
    index('articles_author_idx').on(t.authorId),
    index('articles_approved_by_idx').on(t.approvedBy),
    // The admin article list sorts by `updated_at DESC` (articlesRepo:205);
    // no index above is prefixed by it, so it was a full scan + sort.
    index('articles_updated_idx').on(t.updatedAt),
  ],
);

/**
 * Reader comments on an article (US-14.8) — moderated: every comment is
 * born `pending` and is invisible on the public page until an admin/staff
 * account with `content:write` approves it (`moderateComment` in
 * `commentsRepo.ts`). A logged-in-only submitter (checked at the API
 * route, not here) plus this queue is the whole spam defense for a
 * first version — no anonymous posting, nothing goes live unread.
 */
export const articleComments = pgTable(
  'article_comments',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    // Comments are content, not just a join row — preserve them like
    // articles.authorId does, just drop the reference to a since-deleted
    // account rather than deleting the comment itself.
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    status: text('status', { enum: COMMENT_STATUSES }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    moderatedBy: text('moderated_by').references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  },
  (t) => [
    // The public page's own read: approved comments for ONE article,
    // oldest first. The admin queue's own read (status='pending' across
    // every article) is low-volume by construction — moderation queues
    // do not grow past what a human clears — so it stays a plain scan.
    index('article_comments_article_status_idx').on(t.articleId, t.status),
    index('article_comments_user_idx').on(t.userId),
    index('article_comments_moderated_by_idx').on(t.moderatedBy),
  ],
);

/**
 * "این نظر مفید بود؟" — one vote per (comment, user) (US-14.9, the
 * comments-UX redesign). A separate table rather than a counter column
 * on `articleComments`: the unique (comment_id, user_id) index is what
 * makes a toggle idempotent (insert-or-delete, never a += that a
 * double-click could apply twice) and is what lets the page tell THIS
 * viewer whether they already voted, which a bare count could not.
 */
export const commentHelpfulVotes = pgTable(
  'comment_helpful_votes',
  {
    id: text('id').primaryKey(),
    commentId: text('comment_id')
      .notNull()
      .references(() => articleComments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('comment_helpful_votes_comment_user_idx').on(t.commentId, t.userId),
    index('comment_helpful_votes_user_idx').on(t.userId),
  ],
);

export const brandLogos = pgTable('brand_logos', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['partner', 'customer'] }).notNull(),
  name: text('name').notNull(),
  logoUrl: text('logo_url').notNull(),
  order: integer('order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});
