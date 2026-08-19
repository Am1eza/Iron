import json, re, html as ht, os
HERE = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(HERE, 'pages_b', 'manifest.json'), encoding='utf-8'))
rows = json.load(open(os.path.join(HERE, 'ahanonline_b.json'), encoding='utf-8'))
counts = {}
for r in rows:
    counts[r['key']] = counts.get(r['key'], 0) + 1
for key, path, fn, st in man:
    if counts.get(key):
        continue
    h = open(fn, encoding='utf-8').read()
    t = re.sub(r'<script.*?</script>', '', h, flags=re.S)
    t = ht.unescape(re.sub(r'<[^>]+>', ' ', t))
    t = re.sub(r'\s+', ' ', t)
    m = re.search(r'(\d+)\s*محصول', t)
    nf = 'هیچ موردی' in t
    print('%-40s | %-46s | count=%-5s | notfound=%s' % (key, path, m.group(1) if m else '?', nf))
