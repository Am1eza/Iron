CREATE TABLE "admin_allowlist" (
	"mobile" text PRIMARY KEY NOT NULL,
	"label" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_allowlist" ADD CONSTRAINT "admin_allowlist_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;