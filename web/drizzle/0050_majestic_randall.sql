CREATE UNIQUE INDEX "sub_categories_id_category_uq" ON "sub_categories" USING btree ("id","category_id");--> statement-breakpoint
-- Repair legacy rows before making the invariant impossible to violate. An
-- orphan sub_category_id is already prevented by the original FK; this only
-- reconciles the redundant category_id with its authoritative parent.
UPDATE "skus" AS s
SET "category_id" = sc."category_id", "updated_at" = now()
FROM "sub_categories" AS sc
WHERE s."sub_category_id" = sc."id"
  AND s."category_id" <> sc."category_id";--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_sub_category_parent_fk" FOREIGN KEY ("sub_category_id","category_id") REFERENCES "public"."sub_categories"("id","category_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_order_range_ck" CHECK ("skus"."order" between 0 and 10000);--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_weight_range_ck" CHECK ("skus"."theoretical_weight_kg" is null or ("skus"."theoretical_weight_kg" > 0 and "skus"."theoretical_weight_kg" <= 100000));--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_branch_length_range_ck" CHECK ("skus"."branch_length_m" is null or ("skus"."branch_length_m" > 0 and "skus"."branch_length_m" <= 100));--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_unit_ck" CHECK ("skus"."unit" in ('kg','branch','sheet','meter','piece','sqm'));--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_price_basis_ck" CHECK ("skus"."price_basis" in ('kg','branch','coil','sheet','piece','sqm'));
