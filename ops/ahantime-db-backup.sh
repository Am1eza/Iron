#!/usr/bin/env bash
# All-engine, encrypted backup. No fixture seeding or production restore.
set -euo pipefail
umask 077
CONF=${AHANTIME_BACKUP_CONFIG:-/etc/ahantime-backup.env}
[[ -r "$CONF" ]] || { echo 'backup configuration missing' >&2; exit 1; }
set -a
. "$CONF"
set +a
: "${RESTIC_REPOSITORY:?off-host repository required}"
: "${RESTIC_PASSWORD_FILE:?independent recovery password file required}"
: "${LOCAL_RESTIC_REPOSITORY:?encrypted local repository required}"
# Reject local paths; the operator must additionally verify failure-domain independence.
case "$RESTIC_REPOSITORY" in
  s3:*|sftp:*|rest:https:*|b2:*|azure:*|gs:*|rclone:*) ;;
  *) echo 'An off-host restic repository is required' >&2; exit 1;;
esac
[[ -s "$RESTIC_PASSWORD_FILE" ]] || exit 1
export RESTIC_CACHE_DIR=${RESTIC_CACHE_DIR:-/var/cache/ahantime-restic}
mkdir -p "$RESTIC_CACHE_DIR"
cd "${AHANTIME_DEPLOY_DIR:-/opt/ahantime}"
# flock is available on the Linux production host. Concurrent dumps/prune are forbidden.
exec 9>/var/lock/ahantime-backup.lock
flock -n 9 || { echo 'another backup is running' >&2; exit 1; }
STAGE=$(mktemp -d /var/tmp/ahantime-backup.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)
printf '%s\n' "$RUN_ID" > "$STAGE/run-id"
pg_backup() {
  local service=$1 user=$2 database=$3
  docker compose exec -T "$service" pg_dump -U "$user" -d "$database" -Fc > "$STAGE/$service.dump"
  docker compose exec -T "$service" pg_dumpall -U "$user" --globals-only > "$STAGE/$service-globals.sql"
  [[ -s "$STAGE/$service.dump" && -s "$STAGE/$service-globals.sql" ]]
}
pg_backup db ahantime ahantime
pg_backup glitchtip-db glitchtip glitchtip
# Password expanded inside container, never in the host command or log.
docker compose exec -T matomo-db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot --single-transaction --routines --events --triggers --all-databases' > "$STAGE/matomo.sql"
[[ -s "$STAGE/matomo.sql" ]]
# Discover the real mounted upload volume, do not assume a Compose project name.
WEB_ID=$(docker compose ps -q web)
[[ -n "$WEB_ID" ]] || { echo 'web container missing' >&2; exit 1; }
UPLOADS=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/public/uploads"}}{{.Source}}{{end}}{{end}}' "$WEB_ID")
[[ -d "$UPLOADS" ]] || { echo 'uploads mount missing' >&2; exit 1; }
tar -C "$UPLOADS" -cf "$STAGE/uploads.tar" .
(cd "$STAGE" && sha256sum db.dump db-globals.sql glitchtip-db.dump glitchtip-db-globals.sql matomo.sql uploads.tar > SHA256SUMS)
# Fixed path inside repository via stdin tar: one snapshot is a complete restore set.
# Repositories must be initialized explicitly; a typo must not create a new empty one.
for repository in "$LOCAL_RESTIC_REPOSITORY" "$RESTIC_REPOSITORY"; do
  tar -C "$STAGE" -cf - . | restic -r "$repository" backup --stdin --stdin-filename complete.tar --tag ahantime-complete --tag "$RUN_ID" --host ahantime >/dev/null
  restic -r "$repository" snapshots --tag "$RUN_ID" --json | python3 -c 'import json,sys; assert len(json.load(sys.stdin)) == 1'
  restic -r "$repository" forget --tag ahantime-complete --host ahantime --group-by host --keep-daily 14 --keep-weekly 8 --prune >/dev/null
 done
# tags include a unique run id; group by host, NOT tags, for retention.
echo "backup complete: $RUN_ID (all databases + uploads; encrypted local and remote)"
