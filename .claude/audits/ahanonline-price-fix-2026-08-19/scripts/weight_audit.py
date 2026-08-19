"""How far does the round-bar weight formula reach into categories it does not
belong in? `theoreticalWeightFor` returns a value only for rebar/wire today, but
the seeded rows carry d²/162 × 12 applied to whatever number their size string
starts with — for a 3-inch pipe that is 0.7 kg."""
import json, re, collections

d = json.load(open('work/our_skus.json', encoding='utf-8'))
DIG = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')
hits = collections.defaultdict(list)
for s in d:
    tw, size = s['theoretical_weight_kg'], s['size']
    if tw is None or not size:
        continue
    m = re.match(r'[\d.]+', size.translate(DIG))
    if not m:
        continue
    n = float(m.group(0))
    expect = round(n * n / 162 * 12, 1)
    if abs(tw - expect) < 0.05:
        hits[(s['cat_name'], s['sub_name'])].append((s['name'], size, tw))

tot = sum(len(v) for v in hits.values())
print('active SKUs whose theoretical_weight_kg is exactly d²/162 × 12 m of the SIZE NUMBER:', tot)
print()
for k, v in sorted(hits.items()):
    if k[0] == 'میلگرد':
        continue
    print('%-16s %-22s %-3d  e.g. %s (size %s -> %s kg)' % (k[0], k[1], len(v), v[0][0], v[0][1], v[0][2]))
print()
print('میلگرد rows where the formula IS correct: %d' % sum(len(v) for k, v in hits.items() if k[0] == 'میلگرد'))
