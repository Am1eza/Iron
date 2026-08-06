CREATE TABLE "search_console_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"query" text NOT NULL,
	"clicks" real DEFAULT 0 NOT NULL,
	"impressions" real DEFAULT 0 NOT NULL,
	"ctr" real DEFAULT 0 NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_console_metrics_path_query_key" UNIQUE("path","query")
);
--> statement-breakpoint
CREATE INDEX "search_console_metrics_path_idx" ON "search_console_metrics" USING btree ("path");