#!/bin/sh
# Every sub-category this run populated, loaded through Caddy. A page that still
# renders the empty state prints به‌زودی>1; a real table prints تومان>>0.
sh work/check_live.sh \
  /prices/rebar/heat-treated /prices/rebar/stainless \
  /prices/wire/welding-wire /prices/wire/wire-rod \
  /prices/sheet/grating /prices/sheet/aluzinc /prices/sheet/tin-coated \
  /prices/sheet/perforated-black /prices/sheet/wear-resistant /prices/sheet/marine \
  /prices/pipe/well-casing /prices/pipe/thick-walled \
  /prices/profile/congress /prices/angle-channel/val-post \
  /prices/steel/pipe /prices/steel/profile /prices/steel/angle /prices/steel/channel \
  /prices/felezat-rangi/copper-pipe /prices/felezat-rangi/copper-strip \
  /prices/felezat-rangi/copper-sheet
