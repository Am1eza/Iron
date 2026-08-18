CREATE TABLE "factory_order" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"factory" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factory_order" ADD CONSTRAINT "factory_order_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "factory_order_category_factory_uq" ON "factory_order" USING btree ("category_id","factory");--> statement-breakpoint
CREATE INDEX "factory_order_category_order_idx" ON "factory_order" USING btree ("category_id","order");