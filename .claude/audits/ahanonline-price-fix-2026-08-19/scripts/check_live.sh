#!/bin/sh
# Load a few real pages through Caddy (port 3000 is not host-exposed) and count
# the empty-state / «تماس بگیرید» markers against real price rows.
for u in "$@"; do
  f="work/live_$(echo "$u" | tr '/' '_').html"
  code=$(curl -sk -o "$f" -w '%{http_code}' --max-time 60 --resolve ahantime.com:443:127.0.0.1 "https://ahantime.com$u")
  soon=$(grep -o 'به‌زودی' "$f" | wc -l)
  call=$(grep -o 'تماس بگیرید' "$f" | wc -l)
  tom=$(grep -o 'تومان' "$f" | wc -l)
  printf '%-46s http=%s  به‌زودی=%-4s تماس‌بگیرید=%-5s تومان=%s\n' "$u" "$code" "$soon" "$call" "$tom"
done
