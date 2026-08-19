"""Collate the numbers and tables the final report quotes, so none of them is
typed by hand."""
import json, collections

plan = json.load(open('work/plan_a.json', encoding='utf-8'))
planb = json.load(open('work/plan_b.json', encoding='utf-8'))
writes = [p for p in plan if p['action'] == 'write']
skips = [p for p in plan if p['action'] == 'skip']

print('### A — writes by tier/category')
for tier in ('T1', 'T2', 'T2b', 'T3'):
    rows = [p for p in writes if p['tier'] == tier]
    c = collections.Counter(p['cat'] for p in rows)
    print('%-4s %-4d %s' % (tier, len(rows), dict(c)))
print('total', len(writes))
print()

print('### A — writes by category / sub')
for k, v in sorted(collections.Counter((p['cat'], p['sub']) for p in writes).items()):
    print('%-16s %-24s %d' % (k[0], k[1], v))
print()

print('### A — skipped, grouped')
groups = collections.defaultdict(list)
for p in skips:
    key = p['reason'].split(' —')[0].split(' AND ')[0][:70]
    groups[key].append(p)
for k, v in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    print('%-4d %s' % (len(v), k))
print()

print('### A — هاش detail')
for p in skips:
    if 'هاش' in p['reason'][:6] or p['sub'].startswith('هاش'):
        print('  %-32s | %-18s | old=%-7s | ahanonline ref=%s' % (
            p['name'], p['factory'], p['old_price'], p['reference_price']))
print()

print('### A — refused: no ahanonline شاخه row (تیرآهن)')
for p in skips:
    if 'publishes no 12 m' in p['reason']:
        print('  %-28s | %s' % (p['name'], p['factory']))
print()

print('### A — mill differs AND spread too wide (reference price recorded)')
for p in skips:
    if "spread for size" in p['reason']:
        print('  %-34s | %-18s | old=%-7s | ref=%-8s | %s' % (
            p['name'], p['factory'], p['old_price'], p['reference_price'], p['reason'][:110]))
print()

print('### A — single-row, mill not ours')
for p in skips:
    if p['reason'].startswith('only one ahanonline row'):
        print('  %-34s | %-18s | old=%-7s | ref=%s' % (p['name'], p['factory'], p['old_price'], p['reference_price']))
print()

print('### A — unmatched (no counterpart), by sub')
um = [p for p in skips if p['reason'].startswith('no ahanonline counterpart')]
for k, v in sorted(collections.Counter((p['cat'], p['sub']) for p in um).items()):
    sizes = sorted({p['size'] or '—' for p in um if (p['cat'], p['sub']) == k})
    print('%-16s %-22s %-3d %s' % (k[0], k[1], v, '، '.join(sizes)))
print()

print('### B — created per sub-category')
for k, v in sorted(collections.Counter((x['cat_name'], x['sub_name']) for x in planb['skus']).items()):
    prices = [x['price'] for x in planb['skus'] if (x['cat_name'], x['sub_name']) == k]
    units = sorted({x['unit'] for x in planb['skus'] if (x['cat_name'], x['sub_name']) == k})
    print('%-14s | %-22s | %-3d | %-7s | %s – %s' % (
        k[0], k[1], v, ','.join(units), min(prices), max(prices)))
print()
print('### B — notes')
for label, n, why in planb['notes']:
    print('%-22s %-4d %s' % (label, n, why))
