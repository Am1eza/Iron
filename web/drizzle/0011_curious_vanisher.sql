ALTER TABLE "otp_codes" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "prev_expires_at" bigint;