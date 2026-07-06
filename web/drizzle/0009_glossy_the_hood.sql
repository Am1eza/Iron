CREATE TABLE "ai_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"source_message_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_corrections_active_idx" ON "ai_corrections" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ai_corrections_question_trgm_idx" ON "ai_corrections" USING gin ("question" gin_trgm_ops);