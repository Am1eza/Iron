CREATE TABLE "search_console_auth" (
	"id" text PRIMARY KEY NOT NULL,
	"site_url" text,
	"refresh_token" text,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"oauth_state" text,
	"oauth_state_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
