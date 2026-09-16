#!/usr/bin/env bash
# Restore into disposable containers only. Never points at the production stack.
set -euo pipefail
umask 077
set -a
. "${AHANTIME_BACKUP_CONFIG:-/etc/ahantime-backup.env}"
set +a
: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD_FILE:?}"
# Supply immutable snapshot id; do not silently pick a different backup mid-drill.
SNAPSHOT=${1:?Usage: ahantime-restore-drill.sh SNAPSHOT_ID}
[[ "$SNAPSHOT" =~ ^[0-9a-f]{8,64}$ ]] || exit 1
WORK=$(mktemp -d)
PG_NAME="ahantime-drill-pg-$$"
MY_NAME="ahantime-drill-my-$$"
cleanup() { docker rm -f "$PG_NAME" "$MY_NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
START=$(date +%s)
restic dump "$SNAPSHOT" complete.tar | tar -xf - -C "$WORK"
(cd "$WORK" && sha256sum -c SHA256SUMS)
docker run -d --name "$PG_NAME" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
docker run -d --name "$MY_NAME" --network none -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:11 >/dev/null
ready=false
for _ in $(seq 1 60); do
  if docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && docker exec "$MY_NAME" mariadb-admin ping -uroot >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || { echo 'restore containers did not become ready' >&2; exit 1; }
for database in db glitchtip-db; do
  docker exec "$PG_NAME" createdb -U postgres "$database"
  docker exec -i "$PG_NAME" pg_restore -U postgres -d "$database" --no-owner --no-acl --exit-on-error < "$WORK/$database.dump"
done
docker exec -i "$MY_NAME" mariadb -uroot < "$WORK/matomo.sql"
# Structural/business checks; no customer data is printed.
docker exec "$PG_NAME" psql -U postgres -d db -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN
IF EXISTS(SELECT 1 FROM order_items WHERE qty<=0) THEN RAISE EXCEPTION 'invalid order quantities'; END IF;
IF EXISTS(SELECT 1 FROM warehouse_items WHERE quantity_tons<0) THEN RAISE EXCEPTION 'negative inventory'; END IF;
IF NOT EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations) THEN RAISE EXCEPTION 'missing migration history'; END IF;
END \$\$;" >/dev/null
docker exec "$MY_NAME" mariadb -uroot -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema="matomo"' >/dev/null
tar -tf "$WORK/uploads.tar" >/dev/null
printf 'restore drill passed: snapshot=%s duration_seconds=%s\n' "$SNAPSHOT" "$(( $(date +%s) - START ))"
