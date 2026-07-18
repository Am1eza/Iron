CREATE TABLE "ai_eval_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text,
	"message_id" text,
	"question" text NOT NULL,
	"bad_answer" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_eval_candidates_status_idx" ON "ai_eval_candidates" USING btree ("status");