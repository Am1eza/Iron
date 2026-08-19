"""Part A — decide, per active SKU, what price (if any) to publish from the
already-scraped ahanonline data of 2026-08-19.

Nothing is written here. This produces work/plan_a.json, which apply.py consumes.

Tiers
-----
T1  exact/fuzzy match, our unit kg, ahanonline quoted per kg  -> take it directly.
T2  our unit is `branch` (تیرآهن) -> take ahanonline's own per-شاخه, 12 m,
    بنگاه تهران row for the same size+mill. No conversion, no assumed weight.
    Cross-checked against theoretical_weight_kg: the implied T/kg must land in
    the 65k-115k band their own تیرآهن page publishes, else the row is dropped.
T3  `uncertain` match (size matched on the right page, mill differs or the page
    publishes no mill) -> accept ONLY when ahanonline's own cross-mill spread
    for that exact size on that page is <= 15 %, i.e. when the mill demonstrably
    does not move the price. Price written is the median across those rows.
    Everything else is refused and reported, never guessed.
"""
import json, re, statistics, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = '/opt/ahantime/.claude/audits/ahanonline-price-comparison-2026-08-19'
RAW = json.load(open(AUD + '/ahanonline-raw-2026-08-19.json', encoding='utf-8'))
CMP = {x['sku_id']: x for x in json.load(open(AUD + '/price-comparison-ahanonline-2026-08-19.json', encoding='utf-8'))}
OURS = json.load(open('work/our_skus.json', encoding='utf-8'))

SPREAD_MAX = 1.15          # T3 gate: max/min across mills for the same size
BEAM_BAND = (65_000, 115_000)   # T/kg band ahanonline's own تیرآهن page publishes

# ---------------------------------------------------------------- helpers
DIG = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')


def norm(s):
    if not s:
        return ''
    s = s.translate(DIG)
    s = s.replace('‌', ' ').replace('ـ', '')
    s = s.replace('ك', 'ک').replace('ي', 'ی').replace('ة', 'ه')
    return re.sub(r'\s+', ' ', s).strip()


# our factory name -> the token ahanonline uses on its تیرآهن page
BEAM_FACTORY = {
    'ذوب‌آهن اصفهان': 'ذوب آهن',
    'فایکو': 'فایکو',
    'یزد': 'یزد',
    'اهواز': 'اهواز',
    'ظفر بناب': 'بناب',
}

by_page = {}
for r in RAW:
    by_page.setdefault(r['source_path'], []).append(r)


def product_line_refusal(s, c):
    """A size can match across two product lines that are not the same product.
    These five refusals are hand-checked against the actual ahanonline rows and
    are stated in the report; everything not listed here is allowed through."""
    sub, src, cat = s['sub_name'], c.get('their_source') or '', s['cat_name']
    if src == 'تیرآهن-و-هاش/هاش':
        return ('هاش — ahanonline\'s هاش table prices ذوب‌آهن-branded, ترک-کره and وارداتی rows '
                'identically at 163–227 k T/kg (≈2.2× its own تیرآهن) and carries at least one row '
                'whose واحد says شاخه at 200,000 T. The brand column is not maintained, so no '
                'domestic-mill هاش price can be read off it. Left unpriced by decision.')
    if sub == 'نبشی لقمه':
        return 'matched against a plain نبشی row — نبشی لقمه is a different product'
    if sub == 'پروفیل Z' and src == 'انواع-پروفیل/پروفیلz':
        return ('their Z profile is specified by height (Z16–Z22); our size is a box dimension, '
                'so the digit match is coincidental')
    if sub == 'گازی' and src == 'انواع-لوله/لوله-درز-مستقیم':
        return ('matched rows are تست آب / صنعتی, not gas pipe; their gas rows at our sizes are '
                'per-شاخه only')
    if cat == 'کلاف و مفتول' and src == 'میلگرد/قیمت-میلگرد':
        return 'matched against the straight-bar میلگرد page — a coil is priced on its own page'
    return None


def same_size_rows(page, size, want_unit):
    """Every per-kg (or per-branch) row on `page` whose normalised size matches."""
    out = []
    for r in by_page.get(page, []):
        if norm(r.get('_size')) != norm(size):
            continue
        u = r.get('_unit') or ''
        if want_unit == 'kg' and u not in ('kg', ''):
            continue
        if want_unit == 'branch' and u != 'branch':
            continue
        out.append(r)
    return out


# ---------------------------------------------------------------- planning
plan = []
for s in OURS:
    c = CMP.get(s['id'])
    rec = {
        'sku_id': s['id'], 'slug': s['slug'], 'name': s['name'],
        'cat': s['cat_name'], 'cat_slug': s['cat_slug'], 'sub': s['sub_name'],
        'sub_active': s['sub_active'], 'size': s['size'], 'factory': s['factory'],
        'our_unit': s['unit'], 'tw': s['theoretical_weight_kg'],
        'old_price': s['cur_price'], 'delivery_time': s['delivery_time'],
        'action': 'skip', 'tier': None, 'price': None, 'unit': None,
        'reason': '', 'source_name': '', 'source_code': '', 'source_page': '',
        'reference_price': None,
    }
    if not c:
        rec['reason'] = 'not in the 2026-08-19 comparison set'
        plan.append(rec)
        continue
    rec['confidence'] = c['confidence']
    rec['their_name'] = c.get('their_name') or ''
    rec['their_factory'] = c.get('their_factory') or ''
    rec['their_source'] = c.get('their_source') or ''
    rec['their_size'] = c.get('their_size') or ''

    refusal = product_line_refusal(s, c)
    if refusal:
        rec['reason'] = refusal
        rec['reference_price'] = c.get('their_price_per_kg')
        rec['refused'] = True
        plan.append(rec)
        continue

    # ---- T2: branch-priced SKUs (تیرآهن, and the one branch میلگرد row)
    if s['unit'] == 'branch':
        if s['cat_slug'] == 'ibeam':
            fac = BEAM_FACTORY.get(norm(s['factory'])) or BEAM_FACTORY.get(s['factory'])
            cands = [r for r in by_page.get('تیرآهن-و-هاش/تیرآهن', [])
                     if norm(r.get('_size')) == norm(s['size'])
                     and r.get('_unit') == 'branch'
                     and fac and norm(fac) in norm(r.get('_factory') or r['name'])
                     and 'تهران' in norm(r.get('_deliv') or '')]
            if not cands:
                rec['reason'] = ('ahanonline publishes no 12 m شاخه row for %s %s on its تیرآهن page'
                                 % (s['factory'], s['size']))
                plan.append(rec)
                continue
            r = min(cands, key=lambda x: x['price_toman'])
            per_kg = r['price_toman'] / s['theoretical_weight_kg'] if s['theoretical_weight_kg'] else None
            if per_kg is None or not (BEAM_BAND[0] <= per_kg <= BEAM_BAND[1]):
                rec['reason'] = 'شاخه price implies %s T/kg, outside their own page band' % (
                    round(per_kg) if per_kg else '—')
                rec['reference_price'] = r['price_toman']
                plan.append(rec)
                continue
            rec.update(action='write', tier='T2', price=r['price_toman'], unit='branch',
                       source_name=r['name'].strip(), source_code=r['code'],
                       source_page=r['source_path'],
                       reason='ahanonline per-شاخه 12 m بنگاه تهران; implies %d T/kg on our %.0f kg branch'
                              % (round(per_kg), s['theoretical_weight_kg']))
            plan.append(rec)
            continue
        # the single branch-priced میلگرد row: exact per-kg match × the branch
        # weight from the site's own d²/162 formula (not an assumed number)
        if c['confidence'] in ('exact', 'fuzzy') and c.get('their_price_per_kg') and s['theoretical_weight_kg']:
            p = int(round(c['their_price_per_kg'] * s['theoretical_weight_kg']))
            rec.update(action='write', tier='T2b', price=p, unit='branch',
                       source_name=c['their_name'], source_code=c.get('their_code', ''),
                       source_page=c['their_source'],
                       reason='%s T/kg × %.1f kg branch (d²/162 × 12 m, the site\'s own formula)'
                              % (c['their_price_per_kg'], s['theoretical_weight_kg']))
            plan.append(rec)
            continue
        rec['reason'] = 'branch-priced SKU with no confident per-branch source'
        plan.append(rec)
        continue

    # ---- kg-priced SKUs
    if c['confidence'] in ('exact', 'fuzzy') and not c.get('unit_note') and c.get('their_price_per_kg'):
        rec.update(action='write', tier='T1', price=int(c['their_price_per_kg']), unit='kg',
                   source_name=c['their_name'], source_code=c.get('their_code', ''),
                   source_page=c['their_source'],
                   reason='%s match on %s' % (c['confidence'], c['their_source']))
        plan.append(rec)
        continue

    if c['confidence'] == 'uncertain' and not c.get('unit_note') and c.get('their_price_per_kg'):
        rows = same_size_rows(c['their_source'], c['their_size'], 'kg')
        prices = [r['price_toman'] for r in rows if r['price_toman'] > 0]
        if len(prices) >= 2:
            spread = max(prices) / min(prices)
            facs = sorted({(r.get('_factory') or '').strip() for r in rows})
            if spread <= SPREAD_MAX:
                med = int(round(statistics.median(prices)))
                rec.update(action='write', tier='T3', price=med, unit='kg',
                           source_name='median of %d rows, size %s' % (len(prices), c['their_size']),
                           source_page=c['their_source'],
                           reason='mill not like-for-like, but ahanonline\'s own spread for this size is '
                                  '%.1f%% across %s — category reference' % ((spread - 1) * 100, facs))
                plan.append(rec)
                continue
            rec['reason'] = ('mill differs AND ahanonline\'s own spread for size %s is %.0f%% across %s — '
                             'no defensible single number' % (c['their_size'], (spread - 1) * 100, facs))
            rec['reference_price'] = int(round(statistics.median(prices)))
            plan.append(rec)
            continue
        rec['reason'] = 'only one ahanonline row for this size and its mill is not ours (%s)' % c.get('their_factory')
        rec['reference_price'] = c['their_price_per_kg']
        plan.append(rec)
        continue

    if c.get('unit_note'):
        rec['reason'] = 'ahanonline quotes this per شاخه; our SKU is per kg — see the weight section'
        rec['reference_price'] = c.get('their_price_raw_toman')
        plan.append(rec)
        continue

    rec['reason'] = 'no ahanonline counterpart (unmatched in the 2026-08-19 pass)'
    plan.append(rec)

json.dump(plan, open('work/plan_a.json', 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- summary
import collections
print('total', len(plan))
print(collections.Counter((p['action'], p['tier']) for p in plan))
print()
for tier in ('T1', 'T2', 'T2b', 'T3'):
    rows = [p for p in plan if p['tier'] == tier]
    if rows:
        print('---', tier, len(rows), collections.Counter(p['cat'] for p in rows))
print()
print('--- skipped, by reason head')
for p in plan:
    if p['action'] == 'skip':
        pass
print(collections.Counter(p['reason'].split(' — ')[0][:60] for p in plan if p['action'] == 'skip'))
