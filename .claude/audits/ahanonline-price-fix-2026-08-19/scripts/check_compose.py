"""Pin the Python port of composeSkuName/composeSkuSlug to the real TS one by
re-deriving every existing SKU's name and slug and reporting the disagreements."""
import json, sys, collections
sys.path.insert(0, 'work')
from compose import compose_sku_name, compose_sku_slug

ours = json.load(open('work/our_skus.json', encoding='utf-8'))
name_ok = name_bad = slug_ok = slug_bad = 0
bad_slugs = []
for s in ours:
    n = compose_sku_name(s['sub_name'], s['size'], s['factory'])
    if n == s['name']:
        name_ok += 1
    else:
        name_bad += 1
    sl = compose_sku_slug(s['cat_slug'], s['size'], s['grade'], s['factory'])
    if sl == s['slug']:
        slug_ok += 1
    else:
        slug_bad += 1
        bad_slugs.append((s['slug'], sl, s['name']))
print('names  matched %d / %d' % (name_ok, name_ok + name_bad))
print('slugs  matched %d / %d' % (slug_ok, slug_ok + slug_bad))
print()
print('sample slug disagreements (expected for pre-composeSkuSlug seed rows):')
for a, b, n in bad_slugs[:12]:
    print('  stored=%-34s derived=%-34s %s' % (a, b, n))
