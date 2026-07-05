CREATE TABLE "ai_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text,
	"message_id" text,
	"rating" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_feedback_message_idx" ON "ai_feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_created_idx" ON "ai_feedback" USING btree ("created_at");