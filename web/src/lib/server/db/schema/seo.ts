/**
 * SEO admin tooling (US-14.3) — URL redirects. A separate concern from
 * `content.ts` (author-written pages) and `system.ts` (operational logs):
 * this is site infrastructure an admin configures, not content, and not a
 * log — same one-concern-per-file convention as market.ts/leads.ts/orders.ts.
 */
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const redirects = pgTable('redirects', {
  id: text('id').primaryKey(),
  // Normalized: leading slash, no trailing slash (except root), no query
  // string — see redirectsRepo.ts's normalizePath(). `.unique()` already
  // gives a lookup-by-path a single indexed hit (no separate index needed),
  // and stops two admins creating conflicting redirects for the same source.
  fromPath: text('from_path').notNull().unique(),
  toPath: text('to_path').notNull(),
  // Next's App Router `redirect()`/`permanentRedirect()` (next/navigation)
  // only ever emit 307/308 — there is no supported way to make a Server
  // Component literally answer 301/302. `permanent` maps to the nearest
  // modern equivalent search engines already treat as such (308≈301,
  // 307≈302), rather than storing a literal status code this app can't
  // actually produce.
  permanent: boolean('permanent').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
