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
# It is a warm-up, not a health check — it must never fail a deploy. Every
# probe is best-effort and the script always exits 0.

set -u

BASE="${WARM_BASE:-https://ahantime.com}"
RESOLVE="${WARM_RESOLVE:-ahantime.com:443:127.0.0.1}"

# The pages that are prerendered AND read the catalog. Ordered by how likely a
# human is to land on them first.
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

echo "warm-cache: priming ISR against ${BASE}"

# Pass 1 absorbs the stale copy and triggers regeneration; pass 2 confirms what
# a real visitor will now get. Two passes is the whole point — one is exactly
# the case that leaves the next person with the fixture page.
for p in "${PATHS[@]}"; do
  first=$(probe "$p")
  sleep 2
  second=$(probe "$p")
  printf 'warm-cache: %-8s %s -> %s\n' "$p" "$first" "$second"
done

# A cheap correctness assertion rather than a blind warm-up: /prices/sheet is
# the canonical fixture-only URL. If it still appears on the homepage after
# warming, the regeneration did not happen and someone should look.
if curl -sk --resolve "$RESOLVE" --max-time 20 "${BASE}/" 2>/dev/null | grep -q '/prices/sheet'; then
  echo "warm-cache: WARNING homepage still links /prices/sheet — ISR did not regenerate"
else
  echo "warm-cache: ok, homepage is serving the live catalog"
fi

exit 0
