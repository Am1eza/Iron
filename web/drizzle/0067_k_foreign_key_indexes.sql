-- online-indexes-only
CREATE INDEX "price_points_actor_idx" ON "price_points" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "orders_lead_idx" ON "orders" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "order_fulfillments_reservation_idx" ON "order_fulfillments" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "warehouse_cash_item_idx" ON "warehouse_cash_entries" USING btree ("warehouse_item_id");--> statement-breakpoint
CREATE INDEX "warehouse_cash_order_idx" ON "warehouse_cash_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "warehouse_cash_settlement_idx" ON "warehouse_cash_entries" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "warehouse_reservations_order_item_idx" ON "warehouse_reservations" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "warehouse_reservations_owner_idx" ON "warehouse_reservations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "warehouse_withdrawals_item_idx" ON "warehouse_withdrawals" USING btree ("warehouse_item_id");--> statement-breakpoint
CREATE INDEX "warehouse_withdrawals_reservation_idx" ON "warehouse_withdrawals" USING btree ("reservation_id");