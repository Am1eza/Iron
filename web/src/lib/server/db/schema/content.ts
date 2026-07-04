/**
 * Content — articles (blog/news with the AI-draft → editor approval gate)
 * and brand/customer logos.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import type { SeoMeta } from '@/lib/types/domain';

export const ARTICLE_TYPES = ['blog', 'news'] as const;
export const ARTICLE_STATUSES = ['draft', 'scheduled', 'published'] as const;
export const ARTICLE_SOURCES = ['ai', 'human'] as const;

export const articles = pgTable(
  'articles',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    type: text('type', { enum: ARTICLE_TYPES }).notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    bodyMd: text('body_md').notNull().default(''),
    coverUrl: text('cover_url'),
    status: text('status', { enum: ARTICLE_STATUSES }).notNull().default('draft'),
    source: text('source', { enum: ARTICLE_SOURCES }).notNull().default('human'),
    authorId: text('author_id').references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    relatedSkuIds: jsonb('related_sku_ids').$type<string[]>(),
    relatedCategoryIds: jsonb('related_category_ids').$type<string[]>(),
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
