ALTER TABLE "proformas" ADD COLUMN "volume_discount_toman" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "volume_tier" text;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "volume_discount_label" text;--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN "quoted_weight_kg" double precision;