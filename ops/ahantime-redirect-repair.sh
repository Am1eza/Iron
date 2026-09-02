#!/usr/bin/env bash
#
# Host-side runner for web/scripts/repairRedirectTargets.ts.
#
# WHY THIS EXISTS
# ---------------
# The repair was written for a one-off production audit (1405/06/01 — 22
# two-hop chains, 57 rows landing on a 404) and was then registered nowhere.
# That is the wrong shape for the problem, because the problem regenerates:
#
#   · `redirectsRepo.collapseAround` keeps the table one hop deep only for
#     rows written THROUGH THE PANEL. A row can still be lengthened into a
#     chain by an admin action that never touches that row.
#   · A delete now leaves a tombstone at every level, written in one bulk
#     statement that skips the backward collapse on purpose — so every delete
#     turns any pre-existing row aimed at the deleted page into two hops, and
#     this is the pass that shortens them.
#   · Rows also arrive from outside the panel: the 41 scripts in web/scripts/,
#     and raw DELETE FROM in SQL migrations. Nothing re-checks those at all.
#
# A redirect to a 404 is worse than no redirect at all: the crawler spends two
# fetches to reach a dead end, and the link equity aimed at the old URL is
# thrown away at the second hop instead of the first. Left unattended, that
# drift accumulates silently between audits — which is exactly what happened.
#
# WHAT IT DECIDES, AND WHAT IT DOES NOT
# -------------------------------------
# It collapses chains (mechanical, lossless) and re-aims dead destinations at
# the nearest LIVE ancestor. The ancestor is always defensible and always
# better than a 404, and it is NOT the same as knowing which product a retired
# URL should really land on. That question is the owner's; every re-aimed row
# is named in the journal so it can be overridden in the panel, and a row the
# owner re-points by hand resolves in one hop and is then never touched again
# (the planner is idempotent — see scripts/lib/redirectRepair.test.ts).
#
# It refuses, rather than guesses, when the table is in a state a human should
# look at (a cycle, an over-long chain, a row shadowing a live page, a
# computed destination that is itself a from_path). That exits 1, which leaves
# the systemd unit failed — and on this host `systemctl list-units --failed`
# IS the alert surface, the same convention ahantime-uptime.service uses.
#
# MODE
#   REDIRECT_REPAIR_MODE=apply   (default) write the plan
#   REDIRECT_REPAIR_MODE=check   report only; exits 2 when there is drift
#
# There is no node/npm on this host's PATH (CLAUDE.md §4), so this goes
# through the same throwaway node:20 container the manual recipe uses. It
# mounts the repo checkout — NOT the app image — because `tsx` is a
# devDependency and the runtime image does not carry it.

set -euo pipefail

REPO="${AHANTIME_REPO:-/opt/ahantime}"
NETWORK="${AHANTIME_NETWORK:-ahantime_default}"
MODE="${REDIRECT_REPAIR_MODE:-apply}"

case "$MODE" in
  apply) FLAG="--apply" ;;
  check) FLAG="--check" ;;
  *)
    echo "redirect-repair: unknown REDIRECT_REPAIR_MODE=$MODE (want apply|check)" >&2
    exit 1
    ;;
esac

if [ ! -f "${REPO}/.env" ]; then
  echo "redirect-repair: ${REPO}/.env not found — cannot reach the database." >&2
  exit 1
fi

# `node_modules` has to be on disk for tsx; it is not vendored into the image.
if [ ! -x "${REPO}/web/node_modules/.bin/tsx" ]; then
  echo "redirect-repair: ${REPO}/web/node_modules/.bin/tsx missing — run an install first." >&2
  exit 1
fi

echo "redirect-repair: running in ${MODE} mode against ${REPO}"

# node:20, not node:20-alpine — CLAUDE.md §4's trap.
# --env-file, never an inline -e: the connection string must not reach this
# script's argv, the journal, or `ps`.
#
# `|| status=$?` rather than a bare call: `set -e` would abort here on any
# non-zero exit, and the whole point of the block below is to tell three
# non-zero exits apart.
status=0
docker run --rm \
  --network "$NETWORK" \
  --env-file "${REPO}/.env" \
  -v "${REPO}:/app" \
  -w /app/web \
  node:20 \
  ./node_modules/.bin/tsx scripts/repairRedirectTargets.ts "$FLAG" || status=$?

# 0 = nothing to do or applied · 2 = drift found (check mode only) ·
# 1 = the table needs a human. Only the last one should fail the unit; a
# check-mode 2 is informational and belongs in the journal, not in
# `list-units --failed`, or a monitor that is doing its job looks like a
# broken one.
if [ "$status" -eq 2 ]; then
  echo "redirect-repair: drift found (check mode) — re-run with REDIRECT_REPAIR_MODE=apply"
  exit 0
fi

exit "$status"
