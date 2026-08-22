CREATE TABLE "price_sync_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"old_price" bigint,
	"new_price" bigint,
	"source" text NOT NULL,
	"matched_name" text,
	"matched_factory" text,
	"matched_code" text,
	"matched_unit" text,
	"source_updated_at" text,
	"confidence" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"source_rows" integer DEFAULT 0 NOT NULL,
	"considered_skus" integer DEFAULT 0 NOT NULL,
	"written" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "price_sync_excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "price_sync_entries" ADD CONSTRAINT "price_sync_entries_run_id_price_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."price_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sync_entries" ADD CONSTRAINT "price_sync_entries_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_sync_entries_run_idx" ON "price_sync_entries" USING btree ("run_id","outcome");--> statement-breakpoint
CREATE INDEX "price_sync_entries_sku_idx" ON "price_sync_entries" USING btree ("sku_id","applied_at");--> statement-breakpoint
CREATE INDEX "price_sync_entries_applied_idx" ON "price_sync_entries" USING btree ("applied_at","id");--> statement-breakpoint
CREATE INDEX "price_sync_runs_started_idx" ON "price_sync_runs" USING btree ("started_at");