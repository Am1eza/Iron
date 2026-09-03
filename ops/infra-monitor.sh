#!/bin/bash
# ahantime infra monitor — runs every 15 min via cron, alerts to Telegram only
# when something crosses a threshold. Silent on every normal run by design
# (see AGENTS.md-style rule: don't page anyone for "still fine").
#
# INSTALL: this file lives in git; cron needs its own copy.
#   install -m 0700 ops/infra-monitor.sh /opt/ahantime/ops-scripts/infra-monitor.sh
#   (crontab -l; echo '*/15 * * * * /opt/ahantime/ops-scripts/infra-monitor.sh >> /var/log/ahantime-infra-monitor.log 2>&1  # ahantime infra monitor') | crontab -
# Re-run after any edit — editing the copy in git alone does not reach cron.
# Checks disk %, docker build-cache size, deploy pipeline health (stuck/
# failed for 2h+), how many commits production is behind main, free memory,
# and any failed systemd unit. State (so each condition alerts once, not
# every 15 min) lives in /opt/ahantime/.claude/monitor-state/.
#
# Alerting goes through ops/telegram-forwarder.worker.js, NOT api.telegram.org
# directly — api.telegram.org is blocked at the Iranian national level from
# this server (confirmed: DNS resolves, TCP connect times out). The forwarder
# secret/URL already live in .env (TELEGRAM_API_BASE/TELEGRAM_FORWARD_SECRET),
# set up for exactly this. `curl -4` is required: the forwarder's workers.dev
# domain resolves AAAA-first and this box has no working IPv6 route at all —
# a plain `curl` (no -4) hangs the full timeout on every single call instead
# of falling back, which is what silently broke the first version of this
# script's alerting end to end.
set -euo pipefail

ENV_FILE="/opt/ahantime/.env"
STATE_DIR="/opt/ahantime/.claude/monitor-state"
mkdir -p "$STATE_DIR"

alert() {
  local key="$1" msg="$2"
  local statefile="$STATE_DIR/$key.alerted"
  # De-dupe: only send once per condition, not every 15 min while it persists.
  if [ -f "$statefile" ]; then return 0; fi
  touch "$statefile"
  local bot_token chat_id api_base secret
  bot_token=$(grep -oP '^TELEGRAM_BOT_TOKEN=\K.*' "$ENV_FILE" 2>/dev/null || echo "")
  chat_id=$(grep -oP '^TELEGRAM_ALERT_CHAT_ID=\K.*' "$ENV_FILE" 2>/dev/null || echo "")
  api_base=$(grep -oP '^TELEGRAM_API_BASE=\K.*' "$ENV_FILE" 2>/dev/null || echo "")
  secret=$(grep -oP '^TELEGRAM_FORWARD_SECRET=\K.*' "$ENV_FILE" 2>/dev/null || echo "")
  if [ -n "$bot_token" ] && [ -n "$chat_id" ] && [ -n "$api_base" ] && [ -n "$secret" ]; then
    curl -sS -4 --max-time 15 -X POST "${api_base}/bot${bot_token}/sendMessage?key=${secret}" \
      -H 'content-type: application/json' \
      --data-binary "$(jq -n --arg chat_id "$chat_id" --arg text "🚨 ahantime infra: ${msg}" '{chat_id:$chat_id, text:$text}')" \
      >/dev/null 2>&1 || true
  fi
}

clear_alert() {
  rm -f "$STATE_DIR/$1.alerted"
}

# --- disk space ---
DISK_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$DISK_PCT" -ge 80 ]; then
  alert "disk" "دیسک روی سرور به ${DISK_PCT}٪ رسیده. df -h / رو چک کن."
else
  clear_alert "disk"
fi

# --- docker build cache re-accumulating ---
CACHE_GB=$(docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk -F'\t' '$1=="Build Cache"{print $2}' | grep -oE '^[0-9.]+' || echo 0)
CACHE_UNIT=$(docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk -F'\t' '$1=="Build Cache"{print $2}' | grep -oE '[A-Za-z]+$' || echo "")
if [ "$CACHE_UNIT" = "GB" ] && awk "BEGIN{exit !($CACHE_GB > 15)}"; then
  alert "buildcache" "Docker build cache به ${CACHE_GB}GB رسیده (دوباره داره جمع میشه). docker builder prune -a -f بزن."
else
  clear_alert "buildcache"
fi

# --- deploy pipeline stuck: last CI-success-on-main push whose deploy never completed ---
# Every external call here is wrapped in `timeout` — this box has a documented
# recurring flake where SSH/TLS to github.com or ghcr.io hangs for minutes
# with no timeout of its own (bit the first draft of this exact script: a
# bare `git fetch origin` hung indefinitely on it). A monitor that can itself
# hang is worse than no monitor — it silently stops checking anything.
cd /opt/ahantime
LAST_DEPLOY_JSON=$(timeout 20 gh run list --workflow=deploy.yml --limit 1 --json conclusion,status,createdAt 2>/dev/null || echo "[]")
LAST_DEPLOY_CONCLUSION=$(echo "$LAST_DEPLOY_JSON" | jq -r '.[0] | select(.status=="completed") | .conclusion // empty' 2>/dev/null || echo "")
LAST_DEPLOY_AGE_S=$(echo "$LAST_DEPLOY_JSON" | jq -r '.[0].createdAt // empty' 2>/dev/null | xargs -I{} date -d {} +%s 2>/dev/null || echo 0)
NOW_S=$(date +%s)
if [ "$LAST_DEPLOY_CONCLUSION" = "failure" ] && [ "$LAST_DEPLOY_AGE_S" -gt 0 ] && [ $(( NOW_S - LAST_DEPLOY_AGE_S )) -gt 7200 ]; then
  alert "deploy" "آخرین اجرای Deploy to production server دو ساعت پیش fail شده و از اونموقع دیپلوی جدیدی نرفته. gh run list --workflow=deploy.yml رو چک کن."
else
  clear_alert "deploy"
fi

# --- running web image vs current main HEAD, too far behind ---
# HTTPS+token, not the `origin` remote (SSH) — the SSH path to github.com is
# exactly what's been hanging; the token still has read access over HTTPS.
GH_TOKEN_FOR_FETCH=$(timeout 10 gh auth token 2>/dev/null || echo "")
if [ -n "$GH_TOKEN_FOR_FETCH" ]; then
  timeout 20 git fetch "https://x-access-token:${GH_TOKEN_FOR_FETCH}@github.com/Am1eza/Iron.git" main:refs/remotes/origin/main -q --force 2>/dev/null || true
fi
MAIN_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "")
RUNNING_TAG=$(grep -oP '^WEB_IMAGE=.*iron-web:\K.*' .env 2>/dev/null || echo "")
if [ -n "$MAIN_HEAD" ] && [ -n "$RUNNING_TAG" ] && [ "$RUNNING_TAG" != "$MAIN_HEAD" ]; then
  BEHIND=$(git rev-list --count "${RUNNING_TAG}..origin/main" 2>/dev/null || echo "?")
  if [ "$BEHIND" != "?" ] && [ "$BEHIND" -gt 5 ]; then
    alert "behind" "production ${BEHIND} کامیت پشت main مونده (image فعلی: ${RUNNING_TAG:0:7}). دیپلوی رو چک کن."
  fi
else
  clear_alert "behind"
fi

# --- memory pressure ---
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
if [ "$AVAIL_MB" -lt 1000 ]; then
  alert "memory" "حافظه‌ی آزاد سرور فقط ${AVAIL_MB}MB مونده."
else
  clear_alert "memory"
fi

# --- any failed systemd unit ---
# Backstop for ahantime-uptime.service's own escalation ladder (which now
# also pushes here directly via notify(), but this catches it — or any other
# unit — even if that wiring itself ever breaks) and for ahantime-uptime.timer
# missing/inactive, which is otherwise a silent way for the whole uptime
# prober to stop running without anything going red in an obvious place.
FAILED_UNITS=$(systemctl list-units --state=failed --no-legend --plain 2>/dev/null | awk '{print $1}' | tr '\n' ' ')
if [ -n "$FAILED_UNITS" ]; then
  alert "failedunits" "این سرویس‌ها روی سرور failed هستن: ${FAILED_UNITS}. systemctl status <name> رو چک کن."
else
  clear_alert "failedunits"
fi

exit 0
