#!/bin/sh
docker exec -i ahantime-db-1 psql -U ahantime -d ahantime -t -A -v ON_ERROR_STOP=1 -c "
select coalesce(json_agg(row_to_json(t)),'[]'::json)::text from (
  select sc.id, sc.slug, sc.name, sc.is_active,
         c.id as cat_id, c.slug as cat_slug, c.name as cat_name
  from sub_categories sc join categories c on c.id = sc.category_id
) t;"
