"""Part B — emit the SQL that creates the new SKUs and their prices.

`theoretical_weight_kg` is deliberately left NULL on every new row. The site's
only defensible source for it is `theoreticalWeightFor`, which returns a value
for round bar alone (d²/162 × 12 m) — and even the one line that would qualify,
میلگرد استیل, is sold by ahanonline in 6 m lengths, so the 12 m branch formula
would overstate a پیش‌فاکتور line by 2×. NULL is what the estimate service is
already built to handle; a wrong number is not.
"""
import json, sys
sys.path.insert(0, 'work')
from ulid import ulid

plan = json.load(open('work/plan_b.json', encoding='utf-8'))
skus = plan['skus']


def q(v):
    if v is None or v == '':
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


out = ['-- Part B: SKUs for the 35 sub-categories activated 2026-08-19 with no products.',
       '-- Sourced from ahanonline product-category listings fetched the same day.',
       'BEGIN;', '']
for s in skus:
    sid = ulid()
    pid = ulid()
    out.append(
        "INSERT INTO skus (id, sub_category_id, category_id, slug, name, standard, size, grade, "
        "dimensions, factory, theoretical_weight_kg, unit, image_url, is_active, "
        "cross_listed_category_ids, seo, created_at, updated_at) VALUES "
        "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, NULL, true, NULL, NULL, now(), now());"
        % (q(sid), q(s['sub_id']), q(s['cat_id']), q(s['slug']), q(s['name']), q(s['standard']),
           q(s['size']), q(s['grade']), q(s['dimensions']), q(s['factory']), q(s['unit'])))
    out.append(
        "INSERT INTO current_prices (sku_id, price, unit, delivery_time, vat_included, "
        "movement_pct, movement_dir, updated_at, updated_by, is_stale) VALUES "
        "(%s, %d, %s, '۲۴ ساعت', false, NULL, 'flat', now(), NULL, false);"
        % (q(sid), s['price'], q(s['unit'])))
    out.append(
        "INSERT INTO price_points (id, sku_id, price, unit, at) VALUES (%s, %s, %d, %s, now());"
        % (q(pid), q(sid), s['price'], q(s['unit'])))
out.append('')
out.append('COMMIT;')
open('work/apply_b.sql', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('new SKUs:', len(skus), '-> work/apply_b.sql')
