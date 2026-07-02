CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"mobile" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "otp_rate_limits" (
	"mobile" text PRIMARY KEY NOT NULL,
	"sends" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_until" bigint
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"mobile" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_mobile_unique" UNIQUE("mobile"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('customer','operator','sales','content','catalog','admin'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"icon_id" text DEFAULT '' NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"seo" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_category_id" text NOT NULL,
	"category_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"standard" text,
	"size" text,
	"grade" text,
	"factory" text,
	"theoretical_weight_kg" double precision,
	"unit" text DEFAULT 'kg' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"seo" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skus_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sub_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"seo" jsonb
);
--> statement-breakpoint
CREATE TABLE "current_prices" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"price" bigint NOT NULL,
	"unit" text NOT NULL,
	"delivery_time" text DEFAULT '۲۴ ساعت' NOT NULL,
	"vat_included" boolean DEFAULT false NOT NULL,
	"movement_pct" double precision,
	"movement_dir" text DEFAULT 'flat' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"is_stale" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"id" text PRIMARY KEY NOT NULL,
	"sku_id" text NOT NULL,
	"price" bigint NOT NULL,
	"unit" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_points" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_values" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"source" text NOT NULL,
	"movement_dir" text DEFAULT 'flat' NOT NULL,
	"movement_pct" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"sku_id" text,
	"market_key" text,
	"op" text NOT NULL,
	"threshold" bigint NOT NULL,
	"channel" text DEFAULT 'sms' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" text DEFAULT 'iron' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_memberships_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mobile" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_items" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"sku_id" text,
	"name" text NOT NULL,
	"qty" double precision NOT NULL,
	"unit" text NOT NULL,
	"weight_kg" double precision,
	"unit_price" bigint,
	"line_total" bigint,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"author_id" text NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"user_id" text,
	"contact_name" text,
	"contact_mobile" text NOT NULL,
	"contact_verified" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"cooperation_type" text,
	"context" jsonb,
	"channel_pref" text DEFAULT 'sms' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assignee_id" text,
	"callback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "proformas" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"ref" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal" bigint NOT NULL,
	"vat_rate" double precision NOT NULL,
	"vat_amount" bigint NOT NULL,
	"total" bigint NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proformas_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "ref_counters" (
	"scope" text PRIMARY KEY NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"note" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"lead_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_requests_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"sku_id" text,
	"name" text NOT NULL,
	"qty" double precision NOT NULL,
	"unit" text NOT NULL,
	"weight_kg" double precision,
	"unit_price" bigint,
	"line_total" bigint
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"user_id" text,
	"lead_id" text,
	"status" text DEFAULT 'registered' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_update" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "warehouse_items" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"user_id" text NOT NULL,
	"product" text NOT NULL,
	"size_label" text,
	"quantity_tons" double precision NOT NULL,
	"monthly_fee_toman" bigint DEFAULT 0 NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_items_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body_md" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'human' NOT NULL,
	"author_id" text,
	"approved_by" text,
	"publish_at" timestamp with time zone,
	"related_sku_ids" jsonb,
	"related_category_ids" jsonb,
	"seo" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "brand_logos" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_sub_category_id_sub_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."sub_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_prices" ADD CONSTRAINT "current_prices_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_prices" ADD CONSTRAINT "current_prices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_items" ADD CONSTRAINT "lead_items_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_items" ADD CONSTRAINT "lead_items_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skus_sub_active_idx" ON "skus" USING btree ("sub_category_id","is_active");--> statement-breakpoint
CREATE INDEX "skus_cat_active_idx" ON "skus" USING btree ("category_id","is_active");--> statement-breakpoint
CREATE INDEX "skus_factory_idx" ON "skus" USING btree ("factory");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_categories_category_slug_uq" ON "sub_categories" USING btree ("category_id","slug");--> statement-breakpoint
CREATE INDEX "price_points_sku_at_idx" ON "price_points" USING btree ("sku_id","at");--> statement-breakpoint
CREATE INDEX "market_points_key_at_idx" ON "market_points" USING btree ("key","at");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alerts_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_sku_uq" ON "favorites" USING btree ("user_id","sku_id");--> statement-breakpoint
CREATE INDEX "lead_items_lead_idx" ON "lead_items" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_notes_lead_idx" ON "lead_notes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_status_assignee_created_idx" ON "leads" USING btree ("status","assignee_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_user_idx" ON "leads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leads_contact_mobile_idx" ON "leads" USING btree ("contact_mobile");--> statement-breakpoint
CREATE INDEX "proformas_lead_idx" ON "proformas" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "user_requests_user_created_idx" ON "user_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "warehouse_items_user_idx" ON "warehouse_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "articles_status_publish_idx" ON "articles" USING btree ("status","publish_at");--> statement-breakpoint
CREATE INDEX "articles_type_status_idx" ON "articles" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "audit_entries_entity_idx" ON "audit_entries" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_entries_actor_at_idx" ON "audit_entries" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "sms_log_to_idx" ON "sms_log" USING btree ("to");