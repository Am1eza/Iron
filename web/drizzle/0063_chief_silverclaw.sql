CREATE TABLE "factory_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"source" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factory_registry_status_ck" CHECK ("factory_registry"."status" in ('verified','unverified'))
);
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "image_approved_by" text;--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "image_approved_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "factory_registry_normalized_name_uq" ON "factory_registry" USING btree ("normalized_name");