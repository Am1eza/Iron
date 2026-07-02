#!/bin/sh
# Container entrypoint — run DB migrations (waits for Postgres), optionally
# seed on first boot, then start the Next standalone server.
set -e

if [ -n "$DATABASE_URL" ]; then
  node scripts/migrate.mjs
  if [ "$SEED_ON_START" = "true" ]; then
    node scripts/seed.mjs
  fi
else
  echo "[entrypoint] DATABASE_URL not set — starting without a database (mock mode)."
fi

exec node server.js
