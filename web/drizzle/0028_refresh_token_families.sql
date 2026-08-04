-- W29 · audit area 2 — refresh-token families + reuse detection.
--
-- ADDITIVE AND NON-DESTRUCTIVE BY CONSTRUCTION. Three nullable columns and one
-- index; no data is rewritten, no constraint is added, nothing is dropped.
-- Every refresh token already in the table keeps working untouched: a NULL
-- family_id means "this token is its own family root" (see
-- lib/auth/service.ts#rotateRefresh), so no live session is invalidated by
-- deploying this — the whole point, since a session bug here logs out real
-- staff and costs an OTP SMS per recovery.
--
-- HAND-EDITED after `drizzle-kit generate`: IF NOT EXISTS on all four
-- statements. Same reasoning as 0027 — the migrator runs the whole pending set
-- inside ONE transaction, so a single already-applied statement would abort the
-- entire run and take the container entrypoint down with it.
--
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" text;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "parent_hash" text;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "rotated_at" bigint;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");
