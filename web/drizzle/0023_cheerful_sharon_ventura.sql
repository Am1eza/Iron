CREATE TABLE "warehouse_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_item_id" text NOT NULL,
	"kind" text NOT NULL,
	"delta_tons" double precision NOT NULL,
	"quantity_after_tons" double precision NOT NULL,
	"note" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_requests" DROP CONSTRAINT "user_requests_ref_unique";--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "intake_note" text;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "contract_ref" text;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "insured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD COLUMN "payment_note" text;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD COLUMN "voids_settlement_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warehouse_movements_item_idx" ON "warehouse_movements" USING btree ("warehouse_item_id","created_at");--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_request_id_user_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."user_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_requests_user_ref_uq" ON "user_requests" USING btree ("user_id","ref");--> statement-breakpoint
-- W20 data backfill (review finding): released_at is a brand-new column, so
-- every warehouse item that was ALREADY 'released' before this migration has
-- released_at = NULL. The stop-clock (warehouseSettlementsRepo.stopClock)
-- only clamps against a non-null releasedAt — left NULL, these items would
-- keep accruing charges against "now" forever, the exact unbounded-accrual
-- bug this migration exists to fix. updated_at is the best available proxy
-- for when the release actually happened: updateWarehouseItem has always
-- stamped it on every write, including every past status change.
UPDATE "warehouse_items" SET "released_at" = "updated_at" WHERE "status" = 'released' AND "released_at" IS NULL;