-- W29 · audit area 21 — missing indexes.
--
-- HAND-EDITED after `drizzle-kit generate`. Two deliberate deviations from the
-- generated output; do not "clean them up":
--
--   1. Every CREATE INDEX carries `IF NOT EXISTS`, and the ADD CONSTRAINT is
--      wrapped in a pg_constraint-guarded DO block. This migration is a NO-OP
--      on the live database: all 25 indexes and the FK were already applied
--      there by hand with CREATE INDEX **CONCURRENTLY** (see 2). On a fresh
--      database it runs normally and creates everything.
--
--   2. It does NOT say CONCURRENTLY. It cannot. drizzle-orm's migrator
--      (pg-core/dialect.js — `await session.transaction(...)`) wraps the ENTIRE
--      pending-migration run in a single transaction, and CONCURRENTLY is
--      rejected inside a transaction block. The statement-breakpoint marker
--      splits statements but does not leave that transaction, so a CONCURRENTLY
--      statement here would abort the whole run and break the container
--      entrypoint. The lock-free build was therefore done out-of-band against
--      production; this file exists so the schema stays reproducible.
--
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_users_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_allowlist_added_by_idx" ON "admin_allowlist" USING btree ("added_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "current_prices_updated_by_idx" ON "current_prices" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_sku_idx" ON "alerts" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorites_sku_idx" ON "favorites" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_items_sku_idx" ON "lead_items" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_notes_author_idx" ON "lead_notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proformas_created_idx" ON "proformas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_requests_lead_idx" ON "user_requests" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_requests_created_idx" ON "user_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_sku_idx" ON "order_items" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_lead_idx" ON "orders" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_placed_at_idx" ON "orders" USING btree ("placed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_items_request_idx" ON "warehouse_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_items_lead_idx" ON "warehouse_items" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_items_received_by_idx" ON "warehouse_items" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_items_stored_at_idx" ON "warehouse_items" USING btree ("stored_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_movements_actor_idx" ON "warehouse_movements" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_settlements_actor_idx" ON "warehouse_settlements" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_author_idx" ON "articles" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_approved_by_idx" ON "articles" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_updated_idx" ON "articles" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_created_idx" ON "ai_conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_log_at_idx" ON "sms_log" USING btree ("at");
