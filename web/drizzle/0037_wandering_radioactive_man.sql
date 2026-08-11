CREATE TABLE "comment_helpful_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_helpful_votes" ADD CONSTRAINT "comment_helpful_votes_comment_id_article_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."article_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_helpful_votes" ADD CONSTRAINT "comment_helpful_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_helpful_votes_comment_user_idx" ON "comment_helpful_votes" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX "comment_helpful_votes_user_idx" ON "comment_helpful_votes" USING btree ("user_id");