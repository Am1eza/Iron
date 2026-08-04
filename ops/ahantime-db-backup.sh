#!/usr/bin/env bash
# Nightly Postgres backup for ahantime. Keeps 14 daily dumps, gzipped.
set -euo pipefail
BACKUP_DIR=/var/backups/ahantime
# These dumps are a full pg_dump of production — every lead, customer mobile,
# order and proforma. The default umask left them 0644, world-readable to any
# non-root user or any process that gets a foothold on the host.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
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

# systemd hands a Type=oneshot unit a minimal environment: no HOME, no
# XDG_CACHE_HOME. restic needs one of them to site its cache and hard-fails
# without it ("unable to locate cache directory: neither $XDG_CACHE_HOME nor
# $HOME are defined"). That is exactly how the off-site copy failed silently
# on three consecutive nights (2026-08-01/02/03) while the local dump kept
# succeeding — the timer ran, the dump landed, and only restic died. Default
# them here rather than in the unit file so the script behaves identically
# under systemd, cron, and an interactive shell.
export HOME="${HOME:-/root}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
mkdir -p "$XDG_CACHE_HOME"

# Back up the published dump only (never the .partial), tagged so `restic
# snapshots --tag` can find them and so a future non-DB backup can coexist.
if ! restic backup --tag ahantime-db --host ahantime \
      "$BACKUP_DIR/ahantime-$TS.sql.gz" >/dev/null; then
  echo "restic: backup FAILED — local dump is still intact at $BACKUP_DIR" >&2
  exit 1
fi

# The DB dump alone is not a restorable system. skus.image_url,
# categories.image_url, articles.cover_url and brand_logos.logo_url are columns
# in the dump, but the FILES they point at live only in the `uploads` Docker
# volume — restore the DB after a host loss and every product image, article
# cover and partner logo is a broken link with no way to reconstruct it.
# Tagged separately so it gets its own retention rule below.
UPLOADS=/var/lib/docker/volumes/ahantime_uploads/_data
if [ -d "$UPLOADS" ]; then
  restic backup --tag ahantime-uploads --host ahantime "$UPLOADS" >/dev/null || \
    echo "restic: uploads copy FAILED (db copy succeeded)" >&2
fi

# Mirror the local 14-day policy. --prune reclaims the space; it is safe to
# interrupt (restic repositories are append-only until prune completes).
# --tag is matched per-snapshot, so each tag needs its own forget call; a single
# call would leave the untagged-for-that-run snapshots unpruned forever.
#
# --group-by is the whole ballgame here and was the bug: restic's DEFAULT
# grouping is `host,paths`, and every db dump is backed up under a UNIQUE path
# because the filename carries a timestamp (ahantime-2026-08-04_0301.sql.gz).
# So each snapshot landed in a group of its own, `--keep-daily 14` kept the one
# snapshot in every group, and restic dutifully reported "keep 1 / remove 0"
# for each — forever. Retention was never applied to a single snapshot since
# the off-site copy was introduced, and because the whole thing was `|| echo`
# it also could never fail the run. Group by tag+host so all dumps for a tag
# are one timeline and the daily/weekly policy actually bites.
#
# These are NOT `|| echo` any more. A retention policy that silently stops
# applying is exactly the failure mode this script already learned the hard way
# (see the freshness check below); an unpruned repository grows without bound
# until the disk fills and then the *backup* starts failing. Loud, non-zero,
# visible to `systemctl status` and `OnFailure=`.
forget_failed=0
if ! restic forget --tag ahantime-db --host ahantime \
      --group-by tag,host --keep-daily 14 --keep-weekly 8 --prune >/dev/null; then
  echo "restic: forget/prune FAILED for ahantime-db — retention is NOT being applied" >&2
  forget_failed=1
fi
if ! restic forget --tag ahantime-uploads --host ahantime \
      --group-by tag,host --keep-daily 14 --keep-weekly 8 --prune >/dev/null; then
  echo "restic: forget/prune FAILED for ahantime-uploads — retention is NOT being applied" >&2
  forget_failed=1
fi

# Assert the copy we just took is actually IN the repository. Without this the
# script's own success message is the only evidence, and for three nights that
# message never printed while nothing noticed. A freshness check turns a silent
# failure into a non-zero exit that `systemctl status` and OnFailure= can see.
# NOT `--latest 1`: restic applies that per distinct (host, paths) group, and
# every dump has a unique path because the filename carries a timestamp — so
# it returns the newest snapshot of EACH path, oldest first, not the newest
# overall. Take the max date across all snapshots for the tag instead.
NEWEST=$(restic snapshots --tag ahantime-db --host ahantime --json 2>/dev/null \
  | grep -o '"time":"[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' | cut -d'"' -f4 | sort | tail -1)
if [ "$NEWEST" != "$(date +%F)" ]; then
  echo "restic: VERIFY FAILED — newest ahantime-db snapshot is '${NEWEST:-none}', expected $(date +%F)" >&2
  exit 1
fi

echo "restic: off-site copy ok ($(restic snapshots --tag ahantime-db --json 2>/dev/null | grep -o '"id"' | wc -l) db snapshots, newest $NEWEST)"

# The dump landed and is verifiably in the repository — that part is fine and
# has already been reported above. But exit non-zero anyway if retention did
# not run, so the unit goes red and OnFailure= fires. Reported last so the
# operator sees "backup ok, retention broken" rather than a bare failure.
if [ "$forget_failed" -ne 0 ]; then
  echo "restic: backup succeeded but RETENTION FAILED — repository will grow unbounded" >&2
  exit 1
fi
