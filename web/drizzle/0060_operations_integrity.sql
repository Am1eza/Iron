-- Refuse to conceal pre-existing inconsistencies. Reconcile on staging first.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM warehouse_items w JOIN warehouse_movements m ON m.warehouse_item_id=w.id GROUP BY w.id HAVING abs(w.quantity_tons-sum(m.delta_tons))>0.0000005) THEN
  RAISE EXCEPTION 'Existing stock/ledger mismatch: run audit:orders and reconcile before migration';
 END IF;
 IF EXISTS (SELECT 1 FROM warehouse_items WHERE status='released' AND quantity_tons<>0) THEN
  RAISE EXCEPTION 'Released legacy stock must be reconciled before migration; no automatic forfeiture is allowed';
 END IF;
END $$;
--> statement-breakpoint
INSERT INTO warehouse_movements(id,warehouse_item_id,kind,delta_tons,quantity_after_tons,note,created_at)
 SELECT 'legacy-opening:'||w.id,w.id,'receipt',w.quantity_tons,w.quantity_tons,'افتتاحیهٔ موجودی legacy؛ نیازمند تطبیق با سند فیزیکی',w.stored_at
 FROM warehouse_items w WHERE w.quantity_tons>0 AND NOT EXISTS(SELECT 1 FROM warehouse_movements m WHERE m.warehouse_item_id=w.id);
--> statement-breakpoint
INSERT INTO warehouse_billing_events(id,warehouse_item_id,effective_at,quantity_tons,monthly_fee_toman,note)
 SELECT 'legacy-billing:'||id,id,coalesce(arrived_at,stored_at),quantity_tons,monthly_fee_toman,'مبنای legacy؛ تاریخچهٔ قبلی تعرفه نامعلوم است'
 FROM warehouse_items WHERE status<>'pending';
--> statement-breakpoint
UPDATE order_items SET historical_sku_id=sku_id WHERE historical_sku_id IS NULL;
--> statement-breakpoint
UPDATE orders SET terms='{"currency":"TOMAN","source":"legacy"}'::jsonb WHERE terms IS NULL;
--> statement-breakpoint
INSERT INTO warehouse_cash_entries(id,warehouse_item_id,owner_id,settlement_id,kind,amount_toman,proof,created_at)
 SELECT 'payment:'||id,warehouse_item_id,user_id,id,'payment',amount_toman,coalesce(payment_note,'پرداخت legacy؛ رسید قبلی بررسی شود'),paid_at
 FROM warehouse_settlements WHERE paid_at IS NOT NULL AND voids_settlement_id IS NULL AND amount_toman>0;
--> statement-breakpoint
ALTER TABLE warehouse_items ADD CONSTRAINT warehouse_released_zero_ck CHECK (status<>'released' OR (quantity_tons=0 AND released_at IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION protect_operations_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME; END IF;
 IF TG_TABLE_NAME='warehouse_settlements' THEN
  IF (to_jsonb(NEW)-ARRAY['paid_at','payment_note','voided_at','actor_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['paid_at','payment_note','voided_at','actor_id'])
    OR (OLD.paid_at IS NOT NULL AND (NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.payment_note IS DISTINCT FROM OLD.payment_note))
    OR (OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at)
    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
    THEN RAISE EXCEPTION 'Settlement history is immutable; use a reversal'; END IF;
 ELSIF TG_TABLE_NAME='order_items' THEN
  IF (to_jsonb(NEW)-'sku_id') IS DISTINCT FROM (to_jsonb(OLD)-'sku_id') OR NEW.sku_id IS NOT NULL THEN RAISE EXCEPTION 'Order item snapshot is immutable'; END IF;
 ELSE
  IF (to_jsonb(NEW)-'actor_id') IS DISTINCT FROM (to_jsonb(OLD)-'actor_id') OR (to_jsonb(NEW)->>'actor_id') IS NOT NULL THEN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['warehouse_movements','warehouse_billing_events','warehouse_cash_entries','warehouse_settlements','order_events','order_fulfillments','order_items'] LOOP
  EXECUTE format('CREATE TRIGGER protect_ledger BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_operations_ledger()',t);
  EXECUTE format('CREATE TRIGGER protect_ledger_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION protect_operations_ledger()',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION verify_warehouse_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner text; row_owner text;
BEGIN
 SELECT user_id INTO owner FROM warehouse_items WHERE id=NEW.warehouse_item_id FOR KEY SHARE;
 row_owner=coalesce(to_jsonb(NEW)->>'owner_id',to_jsonb(NEW)->>'user_id');
 IF owner IS DISTINCT FROM row_owner THEN RAISE EXCEPTION 'Warehouse ownership mismatch'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['warehouse_settlements','warehouse_reservations','warehouse_withdrawals','warehouse_cash_entries'] LOOP
  EXECUTE format('CREATE TRIGGER verify_owner BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION verify_warehouse_owner()',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION verify_settlement_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original warehouse_settlements;
BEGIN
 PERFORM id FROM warehouse_items WHERE id=NEW.warehouse_item_id FOR UPDATE;
 IF NEW.voids_settlement_id IS NOT NULL THEN
  SELECT * INTO original FROM warehouse_settlements WHERE id=NEW.voids_settlement_id;
  IF original.id IS NULL OR original.voided_at IS NULL OR original.voids_settlement_id IS NOT NULL OR
   (NEW.amount_toman,NEW.warehouse_item_id,NEW.user_id,NEW.period_from,NEW.period_to) IS DISTINCT FROM
   (-original.amount_toman,original.warehouse_item_id,original.user_id,original.period_from,original.period_to) THEN
   RAISE EXCEPTION 'Invalid settlement reversal'; END IF;
 ELSIF NEW.voided_at IS NULL AND EXISTS(SELECT 1 FROM warehouse_settlements s WHERE s.warehouse_item_id=NEW.warehouse_item_id AND s.id<>NEW.id AND s.voided_at IS NULL AND s.voids_settlement_id IS NULL AND s.period_from<NEW.period_to AND NEW.period_from<s.period_to) THEN
  RAISE EXCEPTION 'Overlapping active settlement periods';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER verify_period BEFORE INSERT OR UPDATE ON warehouse_settlements FOR EACH ROW EXECUTE FUNCTION verify_settlement_period();
--> statement-breakpoint
CREATE FUNCTION verify_stock_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_id text; w warehouse_items; total numeric;
BEGIN
 IF TG_TABLE_NAME='warehouse_items' THEN item_id=NEW.id; ELSE item_id=NEW.warehouse_item_id; END IF;
 SELECT * INTO w FROM warehouse_items WHERE id=item_id FOR UPDATE;
 IF w.id IS NULL THEN RETURN NULL; END IF;
 -- Direct intake/import must still get an auditable opening movement.
 IF TG_TABLE_NAME='warehouse_items' AND TG_OP='INSERT' AND w.quantity_tons>0 AND NOT EXISTS(SELECT 1 FROM warehouse_movements WHERE warehouse_item_id=item_id) THEN
  INSERT INTO warehouse_movements(id,warehouse_item_id,kind,delta_tons,quantity_after_tons,note,actor_id)
   VALUES('opening:'||item_id,item_id,'receipt',w.quantity_tons,w.quantity_tons,'افتتاحیهٔ موجودی ثبت‌شده',w.received_by);
 END IF;
 SELECT coalesce(sum(delta_tons::numeric),0) INTO total FROM warehouse_movements WHERE warehouse_item_id=item_id;
 IF abs(total-w.quantity_tons::numeric)>0.0000005 THEN RAISE EXCEPTION 'Stock balance must equal its movement ledger'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_ledger_item AFTER INSERT OR UPDATE ON warehouse_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_stock_ledger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_ledger_movement AFTER INSERT ON warehouse_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_stock_ledger();
--> statement-breakpoint
CREATE FUNCTION protect_order_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.terms IS DISTINCT FROM OLD.terms THEN RAISE EXCEPTION 'Order terms are immutable'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_order_terms BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_order_terms();
