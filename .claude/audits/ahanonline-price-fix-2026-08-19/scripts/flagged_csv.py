import json, csv
plan = json.load(open('work/plan_a.json', encoding='utf-8'))
skips = [p for p in plan if p['action'] == 'skip']
cols = ['sku_id', 'slug', 'name', 'cat', 'sub', 'sub_active', 'size', 'factory', 'our_unit',
        'old_price', 'confidence', 'their_source', 'their_name', 'their_factory',
        'reference_price', 'reason']
with open('.claude/audits/ahanonline-price-fix-2026-08-19/unpriced-flagged-2026-08-19.csv',
          'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
    w.writeheader()
    for p in sorted(skips, key=lambda r: (r['cat'], r['sub'], r['name'])):
        w.writerow(p)
print('flagged rows:', len(skips))

created = json.load(open('work/plan_b.json', encoding='utf-8'))['skus']
cols2 = ['cat_name', 'sub_name', 'name', 'slug', 'size', 'grade', 'standard', 'dimensions',
         'factory', 'unit', 'price', 'source']
with open('.claude/audits/ahanonline-price-fix-2026-08-19/new-skus-2026-08-19.csv',
          'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=cols2, extrasaction='ignore')
    w.writeheader()
    for s in created:
        w.writerow(s)
print('new SKU rows:', len(created))

writes = [p for p in plan if p['action'] == 'write']
cols3 = ['sku_id', 'slug', 'name', 'cat', 'sub', 'size', 'factory', 'unit', 'old_price',
         'price', 'tier', 'source_page', 'source_name', 'source_code', 'reason']
with open('.claude/audits/ahanonline-price-fix-2026-08-19/prices-written-2026-08-19.csv',
          'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=cols3, extrasaction='ignore')
    w.writeheader()
    for p in sorted(writes, key=lambda r: (r['cat'], r['sub'], r['name'])):
        w.writerow(p)
print('written rows:', len(writes))
