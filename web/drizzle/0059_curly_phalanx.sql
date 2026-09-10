CREATE TABLE "business_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"mobile" text NOT NULL,
	"message" text NOT NULL,
	"notification" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"actor_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_fulfillments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"reservation_id" text,
	"quantity" double precision NOT NULL,
	"kind" text NOT NULL,
	"proof" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_quantity_ck" CHECK ("order_fulfillments"."quantity">0 and "order_fulfillments"."quantity"<1000000000000)
);
--> statement-breakpoint
CREATE TABLE "warehouse_billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_item_id" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"quantity_tons" double precision NOT NULL,
	"monthly_fee_toman" bigint NOT NULL,
	"actor_id" text,
	"note" text NOT NULL,
	CONSTRAINT "billing_event_numbers_ck" CHECK ("warehouse_billing_events"."quantity_tons" between 0 and 100000 and "warehouse_billing_events"."monthly_fee_toman" between 0 and 1000000000)
);
--> statement-breakpoint
CREATE TABLE "warehouse_cash_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_item_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"order_id" text,
	"settlement_id" text,
	"kind" text NOT NULL,
	"amount_toman" bigint NOT NULL,
	"reverses_id" text,
	"proof" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_cash_entries_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "warehouse_cash_amount_ck" CHECK ("warehouse_cash_entries"."amount_toman"<>0 and "warehouse_cash_entries"."amount_toman" between -9007199254740991 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "warehouse_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_item_id" text NOT NULL,
	"order_item_id" text,
	"owner_id" text NOT NULL,
	"quantity_tons" double precision NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_quantity_ck" CHECK ("warehouse_reservations"."quantity_tons">0 and "warehouse_reservations"."quantity_tons"<=100000)
);
--> statement-breakpoint
CREATE TABLE "warehouse_withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_item_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"quantity_tons" double precision NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reservation_id" text,
	"proof" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawal_quantity_ck" CHECK ("warehouse_withdrawals"."quantity_tons">0 and "warehouse_withdrawals"."quantity_tons"<=100000)
);
--> statement-breakpoint
ALTER TABLE "warehouse_movements" DROP CONSTRAINT "warehouse_movements_warehouse_item_id_warehouse_items_id_fk";
--> statement-breakpoint
ALTER TABLE "warehouse_settlements" DROP CONSTRAINT "warehouse_settlements_warehouse_item_id_warehouse_items_id_fk";
--> statement-breakpoint
DROP INDEX "orders_lead_idx";--> statement-breakpoint
DROP INDEX "warehouse_items_request_idx";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "historical_sku_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "terms" jsonb;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD COLUMN "operation_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD COLUMN "operation_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD COLUMN "segments" jsonb;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_reservation_id_warehouse_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."warehouse_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_billing_events" ADD CONSTRAINT "warehouse_billing_events_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_cash_entries" ADD CONSTRAINT "warehouse_cash_entries_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_cash_entries" ADD CONSTRAINT "warehouse_cash_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_cash_entries" ADD CONSTRAINT "warehouse_cash_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_cash_entries" ADD CONSTRAINT "warehouse_cash_entries_settlement_id_warehouse_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."warehouse_settlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_reservations" ADD CONSTRAINT "warehouse_reservations_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_reservations" ADD CONSTRAINT "warehouse_reservations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_reservations" ADD CONSTRAINT "warehouse_reservations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_withdrawals" ADD CONSTRAINT "warehouse_withdrawals_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_withdrawals" ADD CONSTRAINT "warehouse_withdrawals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_withdrawals" ADD CONSTRAINT "warehouse_withdrawals_reservation_id_warehouse_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."warehouse_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operation_outbox_pending_idx" ON "operation_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","at");--> statement-breakpoint
CREATE INDEX "order_fulfillments_item_idx" ON "order_fulfillments" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "warehouse_billing_events_item_idx" ON "warehouse_billing_events" USING btree ("warehouse_item_id","effective_at");--> statement-breakpoint
CREATE INDEX "warehouse_cash_owner_idx" ON "warehouse_cash_entries" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_reservations_item_idx" ON "warehouse_reservations" USING btree ("warehouse_item_id","status");--> statement-breakpoint
CREATE INDEX "warehouse_withdrawals_owner_idx" ON "warehouse_withdrawals" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_warehouse_item_id_warehouse_items_id_fk" FOREIGN KEY ("warehouse_item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_lead_uq" ON "orders" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_items_request_uq" ON "warehouse_items" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_operation_id_unique" UNIQUE("operation_id");--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_voids_settlement_id_unique" UNIQUE("voids_settlement_id");--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_operation_id_unique" UNIQUE("operation_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qty_ck" CHECK ("order_items"."qty" > 0 and "order_items"."qty" < 1000000000000);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_money_ck" CHECK (("order_items"."unit_price" is null or "order_items"."unit_price" between 0 and 10000000000000) and ("order_items"."line_total" is null or "order_items"."line_total" between 0 and 9007199254740991));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_ck" CHECK ("orders"."status" in ('registered','confirmed','loading','in_transit','delivered'));--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_quantity_ck" CHECK ("warehouse_items"."quantity_tons" between 0 and 100000 and round("warehouse_items"."quantity_tons"::numeric,6)="warehouse_items"."quantity_tons"::numeric);--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_fee_ck" CHECK ("warehouse_items"."monthly_fee_toman" between 0 and 1000000000);--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_status_ck" CHECK ("warehouse_items"."status" in ('pending','stored','selling','released'));--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_quantity_ck" CHECK ("warehouse_movements"."quantity_after_tons" between 0 and 100000 and "warehouse_movements"."delta_tons" between -100000 and 100000);--> statement-breakpoint
ALTER TABLE "warehouse_movements" ADD CONSTRAINT "warehouse_movements_kind_ck" CHECK (("warehouse_movements"."kind"='receipt' and "warehouse_movements"."delta_tons">0) or ("warehouse_movements"."kind"='release' and "warehouse_movements"."delta_tons"<0) or ("warehouse_movements"."kind"='adjustment' and "warehouse_movements"."delta_tons"<>0));--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_money_ck" CHECK ("warehouse_settlements"."amount_toman" between -9007199254740991 and 9007199254740991 and ("warehouse_settlements"."voids_settlement_id" is not null or "warehouse_settlements"."amount_toman">=0));--> statement-breakpoint
ALTER TABLE "warehouse_settlements" ADD CONSTRAINT "warehouse_settlements_period_ck" CHECK ("warehouse_settlements"."period_to">"warehouse_settlements"."period_from");