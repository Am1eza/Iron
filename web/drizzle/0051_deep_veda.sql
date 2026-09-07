ALTER TABLE "skus" DROP CONSTRAINT "skus_sub_category_parent_fk";
--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "identity_key" text GENERATED ALWAYS AS (
      lower(regexp_replace(
        translate(
          (case when coalesce("size", '') = '' and coalesce("grade", '') = '' and
            coalesce("condition", '') = '' and coalesce("dimensions", '') = '' and
            coalesce("schedule", '') = '' and coalesce("standard", '') = ''
          then coalesce("name", '') || '|' || coalesce("factory", '')
          else coalesce("size", '') || '|' || coalesce("grade", '') || '|' ||
            coalesce("condition", '') || '|' || coalesce("dimensions", '') || '|' ||
            coalesce("schedule", '') || '|' || coalesce("standard", '') || '|' ||
            coalesce("factory", '') end)
          || '|' || "unit" || '|' || "price_basis",
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹كيىةآأإ×X*٭‌',
          '01234567890123456789کییهاااxxxx '
        ),
        '[[:space:]_.،,;؛:()\[\]{}\\-]+', '', 'g'
      ))
    ) STORED;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_sub_category_parent_fk" FOREIGN KEY ("sub_category_id","category_id") REFERENCES "public"."sub_categories"("id","category_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "skus_sub_structural_identity_uq" ON "skus" USING btree ("sub_category_id","identity_key",coalesce("branch_length_m", -1));