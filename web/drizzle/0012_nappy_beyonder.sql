ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "national_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_verify_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_national_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "economic_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "biz_verify_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" text;--> statement-breakpoint
CREATE INDEX "users_id_verify_idx" ON "users" USING btree ("id_verify_status");--> statement-breakpoint
CREATE INDEX "users_biz_verify_idx" ON "users" USING btree ("biz_verify_status");--> statement-breakpoint
CREATE INDEX "users_referred_by_idx" ON "users" USING btree ("referred_by");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_unique" UNIQUE("invite_code");