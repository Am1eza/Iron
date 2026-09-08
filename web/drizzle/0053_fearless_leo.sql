ALTER TABLE "current_prices" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "current_prices" SET "confirmed_at" = "updated_at";--> statement-breakpoint
ALTER TABLE "current_prices" ALTER COLUMN "confirmed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "current_prices" ALTER COLUMN "confirmed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "current_prices" ADD COLUMN "version" text;--> statement-breakpoint
UPDATE "current_prices" SET "version" = 'legacy-current:' || "sku_id";--> statement-breakpoint
ALTER TABLE "current_prices" ALTER COLUMN "version" SET DEFAULT 'legacy';--> statement-breakpoint
ALTER TABLE "current_prices" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "current_prices" ADD COLUMN "source" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
UPDATE "current_prices" SET "source" = 'legacy';--> statement-breakpoint
ALTER TABLE "current_prices" ADD COLUMN "source_event_key" text;--> statement-breakpoint
ALTER TABLE "current_prices" ADD COLUMN "source_published_label" text;--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "version" text;--> statement-breakpoint
UPDATE "price_points" SET "version" = "id";--> statement-breakpoint
ALTER TABLE "price_points" ALTER COLUMN "version" SET DEFAULT 'legacy';--> statement-breakpoint
ALTER TABLE "price_points" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "price_is_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "source" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
UPDATE "price_points" SET "source" = 'legacy';--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "source_event_key" text;--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "source_published_label" text;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "price_points" ("id","sku_id","price","unit","price_basis","at","version","price_is_estimated","actor_id","source")
SELECT 'legacy-current:' || cp."sku_id", cp."sku_id", cp."price", cp."unit", cp."price_basis", cp."updated_at", cp."version", cp."price_is_estimated", cp."updated_by", 'legacy'
FROM "current_prices" cp
WHERE NOT EXISTS (SELECT 1 FROM "price_points" pp WHERE pp."id" = 'legacy-current:' || cp."sku_id");--> statement-breakpoint
CREATE INDEX "price_points_version_idx" ON "price_points" USING btree ("version");--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_source_event_key_unique" UNIQUE("source_event_key");
