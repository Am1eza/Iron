#!/usr/bin/env bash
# Nightly Postgres backup for ahantime. Keeps 14 daily dumps, gzipped.
set -euo pipefail
BACKUP_DIR=/var/backups/ahantime
mkdir -p "$BACKUP_DIR"
cd /opt/ahantime
TS=$(date +%F_%H%M)
TMP="$BACKUP_DIR/.ahantime-$TS.sql.gz.partial"
docker compose exec -T db pg_dump -U ahantime -d ahantime | gzip > "$TMP"
# Only publish if the dump is non-trivial (guards against a 0-byte dump on failure)
if [ "$(stat -c%s "$TMP")" -gt 1000 ]; then
  mv -f "$TMP" "$BACKUP_DIR/ahantime-$TS.sql.gz"
else
  rm -f "$TMP"; echo "backup too small — aborted" >&2; exit 1
fi
find "$BACKUP_DIR" -name 'ahantime-*.sql.gz' -mtime +14 -delete

# ---------------------------------------------------------------------------
# Off-site copy (restic). Everything above this line is unchanged and still
# works on its own — the local dump is taken and retained first, so a failure
# down here can never cost us the nightly backup we already have.
#
# Why this exists: for months every backup lived on the same disk as the
# database it was protecting. A lost disk, a lost hosting account or a bad
# `rm` would have taken the dumps with it. The DB is ~16MB gzipped, so the
# off-site copy is essentially free.
#
# Credentials + destination: /etc/ahantime-backup.env (root-only). While the
# owner has not supplied a bucket yet, RESTIC_REPOSITORY points at a second
# local path — that is NOT off-site and does not close the risk; it exists so
# the whole pipeline is proven and switching to the real bucket is a one-line
# change. See docs/BACKUP.md.
# ---------------------------------------------------------------------------
CONF=/etc/ahantime-backup.env
if [ ! -r "$CONF" ]; then
  echo "restic: $CONF missing — local dump kept, OFF-SITE COPY SKIPPED" >&2
  exit 0
fi
set -a; . "$CONF"; set +a
if [ -z "${RESTIC_REPOSITORY:-}" ] || [ -z "${RESTIC_PASSWORD:-}" ]; then
  echo "restic: repository/password unset — local dump kept, OFF-SITE COPY SKIPPED" >&2
  exit 0
fi

# Back up the published dump only (never the .partial), tagged so `restic
# snapshots --tag` can find them and so a future non-DB backup can coexist.
if ! restic backup --tag ahantime-db --host ahantime \
      "$BACKUP_DIR/ahantime-$TS.sql.gz" >/dev/null; then
  echo "restic: backup FAILED — local dump is still intact at $BACKUP_DIR" >&2
  exit 1
fi

# Mirror the local 14-day policy. --prune reclaims the space; it is safe to
# interrupt (restic repositories are append-only until prune completes).
restic forget --tag ahantime-db --host ahantime \
  --keep-daily 14 --keep-weekly 8 --prune >/dev/null || \
  echo "restic: forget/prune failed (backup itself succeeded)" >&2

echo "restic: off-site copy ok ($(restic snapshots --tag ahantime-db --json 2>/dev/null | grep -o '"id"' | wc -l) snapshots)"
