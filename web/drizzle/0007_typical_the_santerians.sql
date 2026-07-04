CREATE INDEX "categories_name_trgm_idx" ON "categories" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "articles_title_trgm_idx" ON "articles" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "articles_excerpt_trgm_idx" ON "articles" USING gin ("excerpt" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "articles_body_trgm_idx" ON "articles" USING gin ("body_md" gin_trgm_ops);