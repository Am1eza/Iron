CREATE TABLE "ai_budget_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_budget_reservations_day_idx" ON "ai_budget_reservations" USING btree ("day");