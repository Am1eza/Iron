ALTER TABLE "price_points" ADD COLUMN "confirmed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "price_points" SET "confirmed_at" = "at" WHERE "confirmed_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "price_points" ALTER COLUMN "confirmed_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "price_points" ALTER COLUMN "confirmed_at" SET NOT NULL;
