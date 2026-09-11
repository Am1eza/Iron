CREATE TABLE "rate_limit_windows" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_windows_expires_idx" ON "rate_limit_windows" USING btree ("expires_at");