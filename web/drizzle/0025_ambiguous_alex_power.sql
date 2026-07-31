ALTER TABLE "articles" ADD COLUMN "tags" jsonb;--> statement-breakpoint
CREATE INDEX "articles_tags_idx" ON "articles" USING gin ("tags" jsonb_path_ops);