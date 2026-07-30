DROP INDEX "alerts_user_idx";--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "alerts_user_status_idx" ON "alerts" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_active_dedup_sku_uq" ON "alerts" USING btree ("user_id","sku_id","op","threshold") WHERE status = 'active' and target_type = 'sku';--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_active_dedup_market_uq" ON "alerts" USING btree ("user_id","market_key","op","threshold") WHERE status = 'active' and target_type = 'market';