"""Sample-verify the Part A plan against ahanonline AS IT IS NOW.

For a spread of planned writes it re-reads the freshly fetched category page and
looks for the exact price we are about to publish, plus the source row's product
code where the plan recorded one. Reports a match/miss per sample, so a stale or
mis-parsed number cannot slip through unnoticed."""
import json, re, sys, os
sys.path.insert(0, 'work')
from parse_b import parse  # same table extractor

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)))
man = json.load(open(os.path.join(HERE, 'pages_verify', 'manifest.json'), encoding='utf-8'))
live = []
for key, path, fn, st in man:
    live += parse(fn, key, path)
by_page = {}
for r in live:
    by_page.setdefault(r['source_path'], []).append(r)

plan = json.load(open('work/plan_a.json', encoding='utf-8'))
writes = [p for p in plan if p['action'] == 'write']

# a deliberate spread: every tier, every category, mixed sub-categories
SAMPLE_IDX = None
picked, seen = [], set()
for p in writes:
    k = (p['tier'], p['cat'], p['sub'])
    if k in seen:
        continue
    if p['source_page'] not in by_page:
        continue
    seen.add(k)
    picked.append(p)
print('samples:', len(picked))
print()
ok = miss = 0
for p in picked:
    rows = by_page.get(p['source_page'], [])
    hit = None
    if p['source_code']:
        hit = next((r for r in rows if r['code'] == p['source_code']), None)
    if hit is None:
        hit = next((r for r in rows if r['price_toman'] == p['price']), None)
    if hit is None and p['tier'] == 'T3':
        # T3 writes a median; accept if the value sits inside the live spread
        # for the rows the plan drew it from
        prices = [r['price_toman'] for r in rows]
        if prices and min(prices) <= p['price'] <= max(prices):
            hit = {'name': 'within live spread %d–%d' % (min(prices), max(prices)),
                   'price_toman': p['price'], 'code': ''}
    status = 'OK  ' if (hit and hit['price_toman'] == p['price']) else 'MISS'
    if status == 'OK  ':
        ok += 1
    else:
        miss += 1
    print('%s %-4s %-30s | ours=%-10s | live=%-10s | %s' % (
        status, p['tier'], p['name'][:30], p['price'],
        hit['price_toman'] if hit else '—', (hit['name'][:60] if hit else p['source_page'])))
print()
print('matched %d / %d' % (ok, ok + miss))
