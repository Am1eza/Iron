"""Parse the pages fetched by fetch_b.py using the same table extractor the
2026-08-19 comparison pass used (scripts/parse.py), so both datasets have an
identical shape."""
import re, json, html as ht, os

HERE = os.path.dirname(os.path.abspath(__file__))


def txt(s):
    return re.sub(r'\s+', ' ', ht.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def parse(fn, key, path):
    h = open(fn, encoding='utf-8').read()
    out = []
    for tm in re.finditer(r'<table.*?</table>', h, re.S):
        tbl = tm.group(0)
        headers = [txt(x) for x in re.findall(r'<th[^>]*>(.*?)</th>', tbl, re.S)]
        if not headers:
            continue
        pre = h[max(0, tm.start() - 4000):tm.start()]
        cands = re.findall(r'font-Bold text-\[18px\][^>]*>(.*?)</div>', pre, re.S)
        group = txt(cands[-1]) if cands else ''
        if not group:
            heads = re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', pre, re.S)
            group = txt(heads[-1]) if heads else ''
        group = re.sub(r'آخرین بروزرسانی.*$', '', group).strip()
        for rm in re.finditer(r'<tr[^>]*>(.*?)</tr>', tbl, re.S):
            row = rm.group(1)
            if '<th' in row:
                continue
            price = re.search(r'data-price="(\d+)"', row)
            if not price:
                continue
            name = re.search(r'data-name="([^"]*)"', row)
            code = re.search(r'data-code="([^"]*)"', row)
            cells = [txt(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
            rec = {'key': key, 'source_path': path, 'group': group,
                   'name': ht.unescape(name.group(1)) if name else '',
                   'code': code.group(1) if code else '',
                   'price_rial': int(price.group(1)),
                   'price_toman': int(price.group(1)) // 10}
            for i, hd in enumerate(headers):
                if i < len(cells):
                    rec['c_' + hd] = cells[i]
            out.append(rec)
    return out


man = json.load(open(os.path.join(HERE, 'pages_b', 'manifest.json'), encoding='utf-8'))
allrows = []
for key, path, fn, st in man:
    if not os.path.exists(fn):
        print('%-40s MISSING (%s)' % (key, st))
        continue
    rows = parse(fn, key, path)
    allrows += rows
    print('%-42s %4d  %s' % (key, len(rows), st))
json.dump(allrows, open(os.path.join(HERE, 'ahanonline_b.json'), 'w'), ensure_ascii=False, indent=1)
print('TOTAL', len(allrows))
