ALTER TABLE "skus" ADD COLUMN "price_basis" text DEFAULT 'kg' NOT NULL;--> statement-breakpoint
ALTER TABLE "skus" ADD COLUMN "branch_length_m" double precision;--> statement-breakpoint
ALTER TABLE "current_prices" ADD COLUMN "price_basis" text DEFAULT 'kg' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_points" ADD COLUMN "price_basis" text DEFAULT 'kg' NOT NULL;