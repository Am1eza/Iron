#!/bin/sh
# Container entrypoint — run DB migrations (waits for Postgres), optionally
# seed on first boot, start the background job scheduler as its own process
# (see scripts/jobs.ts for why it's no longer inside instrumentation.ts),
# then start the Next standalone server as PID 1.
set -e

if [ -n "$DATABASE_URL" ]; then
  node scripts/migrate.mjs
  if [ "$SEED_ON_START" = "true" ]; then
    node scripts/seed.mjs
  fi
  # Backgrounded, not exec'd — server.js below must stay PID 1 so Docker's
  # SIGTERM reaches it directly. If this process dies, jobs simply stop
  # running until the next container restart; it's stateless and resumable
  # (same "accepted, not fixed" posture already documented on the scheduler
  # for a killed-mid-job replica), so it's not worth a process supervisor.
  node scripts/jobs.mjs &
else
  echo "[entrypoint] DATABASE_URL not set — starting without a database (mock mode)."
fi

exec node server.js
