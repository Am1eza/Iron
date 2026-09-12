ALTER TABLE "ai_usage" ADD COLUMN "reasoning_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "prompt_text_hash" text;