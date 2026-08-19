#!/bin/sh
# Any redirect row shadowing a sub-category this run populated would hide the
# new SKUs behind a 308. Verified explicitly rather than assumed.
docker exec -i ahantime-db-1 psql -U ahantime -d ahantime -P pager=off -c "
select r.from_path, r.to_path
from redirects r
join sub_categories sc on true
join categories c on c.id = sc.category_id
where r.from_path = '/prices/' || c.slug || '/' || sc.slug
  and exists (select 1 from skus s where s.sub_category_id = sc.id and s.is_active
              and s.created_at > now() - interval '6 hours');"
