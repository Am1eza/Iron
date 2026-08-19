import json, collections
plan = json.load(open('work/plan_a.json', encoding='utf-8'))
w = [p for p in plan if p['action'] == 'write']
bad = [p for p in w if not p['price'] or p['price'] <= 0 or p['unit'] != p['our_unit']]
print('unit/price mismatches:', len(bad))
for p in bad:
    print('  ', p['name'], p['unit'], p['our_unit'], p['price'])
print()
for cat in sorted({p['cat'] for p in w}):
    for unit in ('kg', 'branch'):
        ps = [p['price'] for p in w if p['cat'] == cat and p['unit'] == unit]
        if ps:
            print('%-16s %-7s n=%-4d min=%-12d max=%-12d' % (cat, unit, len(ps), min(ps), max(ps)))
print()
print('per-kg rows outside 60k-260k:')
for p in w:
    if p['unit'] == 'kg' and not (60_000 <= p['price'] <= 260_000):
        print('  ', p['cat'], '|', p['name'], p['price'], '|', p['reason'][:80])
