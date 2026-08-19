"""Sample-verify Part B against the ahanonline pages it was built from, by
re-parsing them and looking for the exact price each planned SKU carries."""
import json, collections, sys
rows = json.load(open('work/ahanonline_b.json', encoding='utf-8'))
prices_by_key = collections.defaultdict(set)
names_by_price = {}
for r in rows:
    prices_by_key[r['key'].split('/')[0] + '/' + r['key'].split('/')[1]].add(r['price_toman'])
    names_by_price.setdefault(r['price_toman'], r['name'].strip())
allprices = {r['price_toman'] for r in rows}

plan = json.load(open('work/plan_b.json', encoding='utf-8'))['skus']
picked, seen = [], set()
for p in plan:
    if p['sub_name'] in seen:
        continue
    seen.add(p['sub_name'])
    picked.append(p)
    # a second sample from the same sub-category, the last one
for sub in list(seen):
    last = [p for p in plan if p['sub_name'] == sub][-1]
    if last not in picked:
        picked.append(last)

ok = miss = 0
for p in sorted(picked, key=lambda x: x['sub_name']):
    hit = p['price'] in allprices
    if hit:
        ok += 1
    else:
        miss += 1
    print('%s %-22s | %-34s | %12d | %s' % (
        'OK  ' if hit else 'MISS', p['sub_name'][:22], p['name'][:34], p['price'],
        names_by_price.get(p['price'], p['source'])[:56]))
print()
print('matched %d / %d' % (ok, ok + miss))
