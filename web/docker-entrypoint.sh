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
  # Backgrounded, not exec'd — the server below must stay PID 1 so Docker's
  # SIGTERM reaches it directly. If this process dies, jobs simply stop
  # running until the next container restart; it's stateless and resumable
  # (same "accepted, not fixed" posture already documented on the scheduler
  # for a killed-mid-job replica), so it's not worth a process supervisor.
  # Deliberately ONE process regardless of web clustering — the scheduler
  # additionally takes a Postgres advisory lock per run, so web workers can
  # never double-run a job.
  node scripts/jobs.mjs &
else
  echo "[entrypoint] DATABASE_URL not set — starting without a database (mock mode)."
fi

# cluster.mjs forks WEB_CONCURRENCY workers sharing one listening socket, so
# all CPU cores serve requests instead of just one (see cluster.mjs's header
# for the k6 measurements that motivated it). Falls through to running
# server.js inline when WEB_CONCURRENCY=1 or only one core is available, so
# small hosts behave exactly as before. Still PID 1 → receives SIGTERM and
# forwards it to the workers.
exec node cluster.mjs
