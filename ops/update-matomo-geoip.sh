#!/usr/bin/env bash
# Monthly refresh of Matomo's GeoIP database (DB-IP City Lite, free, CC-BY 4.0,
# no account/license key needed — https://db-ip.com/db/download/ip-to-city-lite).
#
# Added 2026-09-02 after the GeoIp2 plugin was found active with NO database
# file at all (its own auto-updater had run once and silently produced
# nothing, most likely because it expects a MaxMind license key that was
# never configured). Matomo's GeoIp2 plugin natively recognizes DB-IP's
# filename pattern (dbip-city-lite-YYYY-MM.mmdb — see
# plugins/GeoIp2/LocationProvider/GeoIp2.php), so this downloads that
# directly rather than needing any MaxMind account.
#
# DB-IP publishes a new file on/around the 1st of each month; this runs on
# the 2nd to give that a day of buffer. Old dated files are removed after a
# successful new download so misc/ does not accumulate ~120MB every month.
#
# INSTALL: this file lives in git; cron runs its own copy (it existed only
# on the host until 2026-09-18).
#   install -m 0700 ops/update-matomo-geoip.sh /opt/ahantime/ops-scripts/update-matomo-geoip.sh
#   crontab: 30 5 2 * * cd /opt/ahantime && /opt/ahantime/ops-scripts/update-matomo-geoip.sh >> /var/log/matomo-geoip-update.log 2>&1
set -euo pipefail

MONTH="$(date -u +%Y-%m)"
MISC_DIR_HOST="/opt/ahantime"
FILENAME="dbip-city-lite-${MONTH}.mmdb"
URL="https://download.db-ip.com/free/dbip-city-lite-${MONTH}.mmdb.gz"

cd "$MISC_DIR_HOST"

TMP_GZ="$(mktemp)"
trap 'rm -f "$TMP_GZ"' EXIT

echo "[$(date -u +%FT%TZ)] Downloading ${URL}"
curl -fsSL -o "$TMP_GZ" "$URL"

# Sanity check: DB-IP City Lite is consistently ~55-65MB gzipped. A file far
# smaller than that means a bad/empty download (e.g. an error page saved as
# if it were the database) — do not let that overwrite a working database.
SIZE=$(stat -c%s "$TMP_GZ")
if [ "$SIZE" -lt 30000000 ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: downloaded file only ${SIZE} bytes, expected ~55-65MB gzipped. Aborting without touching the installed database."
  exit 1
fi

docker compose exec -T matomo bash -c "gunzip -c" < "$TMP_GZ" > "/tmp/${FILENAME}"
docker cp "/tmp/${FILENAME}" "ahantime-matomo-1:/var/www/html/misc/${FILENAME}"
rm -f "/tmp/${FILENAME}"

docker compose exec -T matomo bash -c "
  chown www-data:www-data /var/www/html/misc/${FILENAME}
  cd /var/www/html/misc
  for f in dbip-city-lite-*.mmdb; do
    [ \"\$f\" = \"${FILENAME}\" ] && continue
    rm -f \"\$f\"
  done
"

echo "[$(date -u +%FT%TZ)] Installed ${FILENAME}"
