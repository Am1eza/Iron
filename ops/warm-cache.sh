#!/usr/bin/env bash
#
# Warm the ISR cache immediately after a deploy.
#
# WHY THIS EXISTS
# ---------------
# `docker compose up -d web` recreates the container, which throws away the
# on-disk .next cache and restores whatever was baked into the image at build
# time. CI builds without DATABASE_URL, so the baked copies of the static index
# pages were rendered from the MOCK FIXTURES. Concretely, the built index.html
# carries 12 links to /prices/sheet — a category that is is_active=false and
# hard-404s on the live site.
#
# Next serves that baked copy stale-while-revalidate: the FIRST visitor after
# every deploy gets the fixture page and only triggers the regeneration that
# the SECOND visitor benefits from. So without this script, the first real
# person to hit the site after each deploy sees a homepage of dead category
# links.
#
# 365470c fixed the crawler-facing surfaces properly — the sitemap and the
# feeds are dynamic now and nothing catalog-shaped is prerendered from
# fixtures any more. The index pages were deliberately left prerendered: making
# them dynamic would spend the LCP < 2.5s / TTFB < 0.8s budget in CLAUDE.md §6
# to fix a window that lasts one request. Absorbing that one request with a
# curl is the cheaper trade, and this script is that curl.
#
# WORKER COUNT MATTERS: cluster.mjs (web/) forks WEB_CONCURRENCY Node worker
# processes that share one listening socket; each worker keeps its OWN
# in-memory ISR cache, and the primary hands off connections to whichever
# worker is free, not round-robin-per-path. "1 request triggers regen, 2nd
# benefits" is only true for a single process. With WEB_CONCURRENCY=5, two
# probes have no guarantee of even landing on the same worker twice, let
# alone touching all five — so a visitor can still get the stale fixture from
# an unwarmed worker after this script reports success. Probe each path
# enough times to make it statistically certain every worker answered at
# least once (WEB_CONCURRENCY + a safety margin), not a fixed two passes.
#
# It is a warm-up, not a health check — it must never fail a deploy. Every
# probe is best-effort and the script always exits 0.

set -u

BASE="${WARM_BASE:-https://ahantime.com}"
RESOLVE="${WARM_RESOLVE:-ahantime.com:443:127.0.0.1}"
WORKERS="${WEB_CONCURRENCY:-3}"
# Requests aren't guaranteed evenly distributed across workers, so probe well
# past the worker count rather than exactly matching it.
ROUNDS=$((WORKERS + 3))

# The pages that are prerendered AND read the catalog. Ordered by how likely a
# human is to land on them first.
#
# /blog and /news were listed here while being fully DYNAMIC — they declared
# `revalidate = 600` and then read `searchParams`, which opts the whole route
# out of ISR in Next 15, so 2×ROUNDS requests per deploy warmed nothing and the
# success line was false confidence. Their page number now lives in the path
# (`/blog/page/2`), so both are genuinely prerendered and these entries do what
# this comment always claimed.
PATHS=(
  "/"
  "/prices"
  "/market"
  "/blog"
  "/news"
)

probe() { # path -> http code
  curl -sk --resolve "$RESOLVE" -o /dev/null -w '%{http_code}' --max-time 20 "${BASE}${1}" 2>/dev/null || echo "000"
}

echo "warm-cache: priming ISR against ${BASE} (${WORKERS} workers, ${ROUNDS} rounds/path)"

# Round 1 absorbs the stale copy and triggers regeneration on whichever worker
# answers; each further round has a chance of landing on a still-unwarmed
# worker and triggering its regeneration too. ROUNDS is sized off the worker
# count, not a fixed two passes — see WORKER COUNT MATTERS above.
for p in "${PATHS[@]}"; do
  codes=""
  for i in $(seq 1 "$ROUNDS"); do
    codes="${codes}$(probe "$p") "
    sleep 1
  done
  printf 'warm-cache: %-8s %s\n' "$p" "$codes"
done

# A cheap correctness assertion rather than a blind warm-up: /prices/sheet is
# the canonical fixture-only URL. If it still appears on the homepage after
# warming, the regeneration did not happen and someone should look. Retry a
# few times with a short backoff before declaring failure — a single check
# can itself land on a worker that hasn't caught up yet.
ok=0
for i in 1 2 3; do
  if curl -sk --resolve "$RESOLVE" --max-time 20 "${BASE}/" 2>/dev/null | grep -q '/prices/sheet'; then
    sleep 2
  else
    ok=1
    break
  fi
done

if [ "$ok" -eq 1 ]; then
  echo "warm-cache: ok, homepage is serving the live catalog"
else
  echo "warm-cache: WARNING homepage still links /prices/sheet after ${ROUNDS} rounds — ISR did not regenerate on all workers"
fi

exit 0
