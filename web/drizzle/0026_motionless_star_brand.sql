ALTER TABLE "leads" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "landing_referrer" text;--> statement-breakpoint
CREATE INDEX "leads_utm_campaign_created_idx" ON "leads" USING btree ("utm_campaign","created_at") WHERE utm_campaign is not null;--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");