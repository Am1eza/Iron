#!/bin/sh
# Dump every active SKU joined to its price row, as JSON, for the pricing pass.
docker exec -i ahantime-db-1 psql -U ahantime -d ahantime -t -A -v ON_ERROR_STOP=1 -c "
select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (
  select s.id, s.slug, s.name, s.standard, s.size, s.grade, s.dimensions, s.factory,
         s.theoretical_weight_kg, s.unit, s.is_active,
         c.slug as cat_slug, c.name as cat_name,
         sc.id as sub_id, sc.slug as sub_slug, sc.name as sub_name, sc.is_active as sub_active,
         cp.price as cur_price, cp.unit as cur_unit, cp.is_stale, cp.updated_at,
         cp.delivery_time, cp.vat_included
  from skus s
  join categories c on c.id = s.category_id
  join sub_categories sc on sc.id = s.sub_category_id
  left join current_prices cp on cp.sku_id = s.id
  where s.is_active
  order by c.\"order\", sc.\"order\", s.name
) t;"
