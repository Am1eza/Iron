CREATE TABLE "warehouse_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"quantity_tons" double precision NOT NULL,
	"monthly_fee_toman" bigint NOT NULL,
	"amount_toman" bigint NOT NULL,
	"note" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warehouse_settlements_item_idx" ON "warehouse_settlements" USING btree ("warehouse_item_id","period_to");--> statement-breakpoint
CREATE INDEX "warehouse_settlements_user_idx" ON "warehouse_settlements" USING btree ("user_id");