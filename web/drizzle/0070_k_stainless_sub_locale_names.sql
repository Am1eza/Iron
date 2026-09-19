-- Per-locale names for the ten stainless / thick-wall sub-categories that were
-- added after `scripts/backfillCategoryLocaleNames.ts` was last run by hand, so
-- /en, /ar and /zh showed their Persian names (menu, breadcrumbs, product
-- titles). The backfill was never part of a deploy; this is, so a fresh
-- database and every environment agree.
--
-- Additive and idempotent: only fills a column that is still NULL, matched by
-- (category slug, sub-category slug); never touches `name`, `order` or any
-- other column, never inserts or deletes. A slug that does not exist in a given
-- environment simply matches no row.
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Profile 304'),
  "name_ar" = COALESCE("name_ar", 'بروفيل ستانلس ستيل 304'),
  "name_zh" = COALESCE("name_zh", '304不锈钢型材')
WHERE "slug" = 'prvfyl-astyl-304'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'profile');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Sheet 304'),
  "name_ar" = COALESCE("name_ar", 'صفيحة ستانلس ستيل 304'),
  "name_zh" = COALESCE("name_zh", '304不锈钢板')
WHERE "slug" = 'vrgh-astyl-304'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'sheet');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Pipe 316'),
  "name_ar" = COALESCE("name_ar", 'أنبوب ستانلس ستيل 316'),
  "name_zh" = COALESCE("name_zh", '316不锈钢管')
WHERE "slug" = 'lvlh-astyl-316'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'sheet');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Pipe 309S'),
  "name_ar" = COALESCE("name_ar", 'أنبوب ستانلس ستيل 309S'),
  "name_zh" = COALESCE("name_zh", '309S不锈钢管')
WHERE "slug" = 'lvlh-astyl-309s'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'sheet');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Pipe 310S'),
  "name_ar" = COALESCE("name_ar", 'أنبوب ستانلس ستيل 310S'),
  "name_zh" = COALESCE("name_zh", '310S不锈钢管')
WHERE "slug" = 'lvlh-astyl-310s'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'sheet');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Thick-Wall Pipe'),
  "name_ar" = COALESCE("name_ar", 'أنبوب سميك الجدار'),
  "name_zh" = COALESCE("name_zh", '厚壁钢管')
WHERE "slug" = 'lvlh-gvshtdar'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'pipe');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Pipe 316L'),
  "name_ar" = COALESCE("name_ar", 'أنبوب ستانلس ستيل 316L'),
  "name_zh" = COALESCE("name_zh", '316L不锈钢管')
WHERE "slug" = 'lvlh-astyl-316l'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'pipe');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Pipe 304'),
  "name_ar" = COALESCE("name_ar", 'أنبوب ستانلس ستيل 304'),
  "name_zh" = COALESCE("name_zh", '304不锈钢管')
WHERE "slug" = 'lvlh-astyl-304'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'pipe');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Angle 304'),
  "name_ar" = COALESCE("name_ar", 'زاوية ستانلس ستيل 304'),
  "name_zh" = COALESCE("name_zh", '304不锈钢角钢')
WHERE "slug" = 'nbshy-astyl-304'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'angle-channel');--> statement-breakpoint
UPDATE "sub_categories" SET
  "name_en" = COALESCE("name_en", 'Stainless Steel Channel 304'),
  "name_ar" = COALESCE("name_ar", 'قناة ستانلس ستيل 304'),
  "name_zh" = COALESCE("name_zh", '304不锈钢槽钢')
WHERE "slug" = 'navdany-astyl-304'
  AND "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'angle-channel');
