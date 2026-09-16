ALTER TABLE "leads" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_target_ck" CHECK (("alerts"."target_type" = 'sku' and "alerts"."sku_id" is not null and "alerts"."market_key" is null) or ("alerts"."target_type" = 'market' and "alerts"."market_key" is not null and "alerts"."sku_id" is null));--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_values_ck" CHECK ("alerts"."op" in ('below','above') and "alerts"."status" in ('active','triggered','paused') and "alerts"."channel" in ('sms','telegram','whatsapp','eitaa') and "alerts"."threshold" between 1 and 10000000000000);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_weight_ck" CHECK ("order_items"."weight_kg" is null or ("order_items"."weight_kg" > 0 and "order_items"."weight_kg" < 1000000000000));--> statement-breakpoint
ALTER TABLE "operation_outbox" ADD CONSTRAINT "outbox_state_ck" CHECK ("operation_outbox"."status" in ('pending','sending','sent','uncertain','failed') and "operation_outbox"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "fulfillment_quantity_ck_status" CHECK ("order_fulfillments"."kind" in ('delivery','return'));--> statement-breakpoint
ALTER TABLE "warehouse_cash_entries" ADD CONSTRAINT "warehouse_cash_amount_ck_status" CHECK ("warehouse_cash_entries"."kind" in ('sale','payout','payment','refund','reversal'));--> statement-breakpoint
ALTER TABLE "warehouse_reservations" ADD CONSTRAINT "reservation_quantity_ck_status" CHECK ("warehouse_reservations"."status" in ('reserved','released','consumed'));--> statement-breakpoint
ALTER TABLE "warehouse_withdrawals" ADD CONSTRAINT "withdrawal_quantity_ck_status" CHECK ("warehouse_withdrawals"."status" in ('requested','approved','delivered','cancelled'));--> statement-breakpoint
CREATE FUNCTION bump_lead_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER leads_version_before_update BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION bump_lead_version();
