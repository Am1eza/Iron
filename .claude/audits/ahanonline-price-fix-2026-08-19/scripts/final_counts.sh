#!/bin/sh
P() { docker exec -i ahantime-db-1 psql -U ahantime -d ahantime -P pager=off -c "$1"; }
echo "== catalog totals"
P "select count(*) filter (where is_active) active_skus, count(*) all_skus from skus;"
echo "== price coverage (active SKUs)"
P "select count(*) active, count(cp.sku_id) with_price_row,
   count(*) filter (where cp.updated_at > now() - interval '2 days') publishable
   from skus s left join current_prices cp on cp.sku_id = s.id where s.is_active;"
echo "== is_stale flag"
P "select is_stale, count(*) from current_prices group by 1;"
echo "== rows written in this pass"
P "select count(*) from current_prices where updated_at > now() - interval '4 hours';"
P "select count(*) from price_points where at > now() - interval '4 hours';"
echo "== per-category coverage"
P "select c.name, count(*) active, count(cp.sku_id) with_row,
   count(*) filter (where cp.updated_at > now()-interval '2 days') publishable
   from skus s join categories c on c.id=s.category_id
   left join current_prices cp on cp.sku_id=s.id
   where s.is_active group by 1 order by 1;"
echo "== new SKUs created in this pass"
P "select count(*) from skus where created_at > now() - interval '4 hours';"
