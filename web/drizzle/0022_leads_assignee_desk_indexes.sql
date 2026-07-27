CREATE INDEX "leads_assignee_status_created_idx" ON "leads" USING btree ("assignee_id","status","created_at");--> statement-breakpoint
CREATE INDEX "leads_assignee_callback_idx" ON "leads" USING btree ("assignee_id","callback_at") WHERE callback_at is not null;
