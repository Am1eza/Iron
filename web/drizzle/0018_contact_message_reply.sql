ALTER TABLE "contact_messages" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD COLUMN "replied_at" timestamp with time zone;