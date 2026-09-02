-- Remove the catalog's soft-delete flag entirely: a row that exists is on the
-- site, and "hide it" is no longer a state the catalog can be in.
--
-- The flag produced a third state — present in the database, invisible to
-- customers, invisible in most admin views. In production that state had grown
-- to 3 categories, 55 sub-categories and 416 products, 302 of them still
-- carrying a live synced price, and it is why «ورق رنگی» read as "missing from
-- the catalog" when it was merely switched off.
--
-- Deleting the flagged rows BEFORE dropping the column is the whole point of
-- the ordering here: dropping the column first would publish every hidden row
-- to the public site in the same deploy. Sub-categories go before categories
-- so the counts stay readable; the FK cascade would reach them either way.
--
-- Nothing transactional is lost. `lead_items.sku_id` and `order_items.sku_id`
-- are ON DELETE SET NULL (see schema/catalog.ts and schemaCascade.test.ts), so
-- quotes and orders keep their frozen name/price snapshot; only the structural
-- children (current_prices, price_points, favorites, alerts,
-- price_sync_entries) cascade away with the product they described.
DELETE FROM "skus" WHERE "is_active" = false;--> statement-breakpoint
DELETE FROM "sub_categories" WHERE "is_active" = false;--> statement-breakpoint
DELETE FROM "categories" WHERE "is_active" = false;--> statement-breakpoint
DROP INDEX "skus_sub_active_idx";--> statement-breakpoint
DROP INDEX "skus_cat_active_idx";--> statement-breakpoint
CREATE INDEX "skus_sub_idx" ON "skus" USING btree ("sub_category_id");--> statement-breakpoint
CREATE INDEX "skus_cat_idx" ON "skus" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "skus" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "sub_categories" DROP COLUMN "is_active";
