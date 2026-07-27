ALTER TABLE "admin_allowlist" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'admin' NOT NULL;
