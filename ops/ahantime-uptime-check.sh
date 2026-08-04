#!/usr/bin/env bash
# Host-side production uptime probe for ahantime.
#
# Why this exists: nothing watched production. The `web` container has a real
# healthcheck, but Docker Compose (this is Compose, not Swarm) only *labels* a
# container unhealthy — it never restarts it and never tells anyone. So the
# site could sit dead behind a green-looking stack indefinitely. There is also
# no external uptime SaaS by policy (Iran reachability + no outbound
# dependencies), so the monitor has to live on this box.
#
# What it does, every 2 minutes via ahantime-uptime.timer:
#   1. probe https://ahantime.com/api/health THROUGH Caddy (--resolve to
#      127.0.0.1, exactly like the deploy verification in CLAUDE.md §5) — this
#      exercises the real path a customer takes: TLS, Caddy, the web upstream,
#      and the app's own DB/Redis health, not just "is the process alive".
#   2. on success: clear the failure counter, done.
#   3. on failure: increment a persistent counter and escalate by streak
#      length, so a single blip during a deploy (the web container restart is
#      a sub-second-to-a-few-seconds gap) does not page anyone.
#
# Escalation ladder (each step only after the previous did not fix it):
#   1 consecutive failure   → log only. Deploys cause these.
#   3 (~6 min down)         → capture diagnostics, restart the `web` container.
#   6 (~12 min down)        → force-recreate `web` + `caddy`.
#   9+ (~18 min down)       → give up on self-healing, exit non-zero every run
#                             so the systemd unit stays red and OnFailure fires.
#
# Alerting is deliberately local: journald + the unit's failed state + a
# wall(1) to logged-in root sessions. No webhook, no SaaS, no SMTP on this
# host. `systemctl list-units --failed` and
# `journalctl -u ahantime-uptime.service` are the alert surface.
set -uo pipefail

HEALTH_URL="https://ahantime.com/api/health"
RESOLVE="ahantime.com:443:127.0.0.1"
STATE_DIR=/var/lib/ahantime-uptime
STATE_FILE="$STATE_DIR/consecutive-failures"
DIAG_DIR="$STATE_DIR/diagnostics"
COMPOSE_DIR=/opt/ahantime
TIMEOUT=15

mkdir -p "$STATE_DIR" "$DIAG_DIR"
fails=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
case "$fails" in ''|*[!0-9]*) fails=0 ;; esac

body=$(mktemp)
trap 'rm -f "$body"' EXIT

code=$(curl -sk -m "$TIMEOUT" --resolve "$RESOLVE" \
  -o "$body" -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)

# The app's /api/health returns 200 with a JSON body only when its own
# dependency checks pass, so HTTP 200 is the whole contract. 000 means curl
# never got a response at all (TLS failure, connection refused, timeout) —
# distinguished in the log because it points at Caddy/the host, not the app.
if [ "$code" = "200" ]; then
  if [ "$fails" -gt 0 ]; then
    echo "ahantime-uptime: RECOVERED after $fails consecutive failures (HTTP 200)"
  fi
  echo 0 > "$STATE_FILE"
  exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE_FILE"

echo "ahantime-uptime: health probe FAILED (HTTP ${code}, streak ${fails}) for $HEALTH_URL" >&2
echo "ahantime-uptime: response body (first 500 bytes): $(head -c 500 "$body" 2>/dev/null)" >&2

capture_diagnostics() {
  local stamp
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  local out="$DIAG_DIR/$stamp.txt"
  {
    echo "=== $(date -u) — health probe failed, HTTP $code, streak $fails ==="
    echo "--- docker compose ps ---"
    (cd "$COMPOSE_DIR" && docker compose ps 2>&1)
    echo "--- web logs (last 100) ---"
    (cd "$COMPOSE_DIR" && docker compose logs --tail=100 --no-color web 2>&1)
    echo "--- caddy logs (last 50) ---"
    (cd "$COMPOSE_DIR" && docker compose logs --tail=50 --no-color caddy 2>&1)
    echo "--- disk ---"
    df -h / /var 2>&1
    echo "--- memory ---"
    free -m 2>&1
  } > "$out" 2>&1
  # Keep a fortnight of incident captures; they are a few hundred KB each.
  find "$DIAG_DIR" -name '*.txt' -mtime +14 -delete 2>/dev/null || true
  echo "ahantime-uptime: diagnostics captured at $out" >&2
  # Surface the container state inline too, so `journalctl -u
  # ahantime-uptime` alone is enough to triage without shelling in.
  (cd "$COMPOSE_DIR" && docker compose ps 2>&1) >&2
}

notify() {
  # No SMTP, no webhook (policy: no external SaaS dependency). Broadcast to
  # any logged-in session and leave a permanent journald record — that plus
  # the unit's failed state is the alert.
  logger -t ahantime-uptime -p daemon.err "$1"
  command -v wall >/dev/null 2>&1 && echo "$1" | wall -n 2>/dev/null || true
}

if [ "$fails" -ge 9 ]; then
  capture_diagnostics
  notify "ahantime: PRODUCTION DOWN ~$((fails * 2)) minutes. Self-healing gave up after two restart attempts. Manual intervention required."
  echo "ahantime-uptime: escalation exhausted — not restarting again, staying red" >&2
  exit 1
fi

if [ "$fails" -eq 6 ]; then
  capture_diagnostics
  notify "ahantime: production health failing ~12 min. Force-recreating web + caddy."
  (cd "$COMPOSE_DIR" && docker compose up -d --force-recreate web caddy) >&2 2>&1
  exit 1
fi

if [ "$fails" -eq 3 ]; then
  capture_diagnostics
  notify "ahantime: production health failing ~6 min. Restarting the web container."
  (cd "$COMPOSE_DIR" && docker compose restart web) >&2 2>&1
  exit 1
fi

# Any streak past the first escalation step keeps the unit red for every run,
# not only on the runs that happen to land exactly on 3/6/9 — otherwise a site
# that stays down would flap the unit green again between escalation steps and
# `systemctl list-units --failed` would show nothing while production is dead.
if [ "$fails" -ge 3 ]; then
  echo "ahantime-uptime: still DOWN (streak $fails, ~$((fails * 2)) minutes)" >&2
  exit 1
fi

# Streaks of 1–2 are almost always a deploy swapping the web container. Logged,
# but the unit stays green so a routine deploy does not raise a false alarm.
exit 0
