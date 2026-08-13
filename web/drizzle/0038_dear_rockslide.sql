ALTER TABLE "skus" ADD COLUMN "cross_listed_category_ids" jsonb;--> statement-breakpoint
CREATE INDEX "skus_cross_listed_idx" ON "skus" USING gin ("cross_listed_category_ids" jsonb_path_ops);