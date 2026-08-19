"""Part B — build the new SKUs for the 35 sub-categories that were activated
today with no products, from the ahanonline listings fetched in fetch_b.py.

Emits work/plan_b.json (reviewable) and work/apply_b.sql.

Rules held to throughout:
  * one SKU per REAL distinct ahanonline product row (or per tight cluster of
    rows that differ only on an axis ahanonline prices identically) — no padding
    with invented variants;
  * `unit` is whatever ahanonline actually quotes (کیلوگرم -> kg, شاخه -> branch,
    شیت/برگ -> sheet), never the category default;
  * names via composeSkuName, slugs via composeSkuSlug (Python port, pinned by
    check_compose.py);
  * factory strings are ahanonline's brand VERBATIM unless our catalog already
    uses an unambiguous spelling of the same mill — «کاشان» is deliberately left
    as «کاشان» rather than guessed into «فولاد کویر کاشان» vs «امیرکبیر کاشان».
"""
import json, re, sys, statistics, collections
sys.path.insert(0, 'work')
from compose import compose_sku_name, compose_sku_slug, normalize_digits
from ulid import ulid

ROWS = json.load(open('work/ahanonline_b.json', encoding='utf-8'))
by_key = collections.defaultdict(list)
for r in ROWS:
    by_key[r['key']].append(r)

SUBS = {s['slug'] if False else k: v for k, v in {}.items()}  # placeholder, filled below

# sub-category ids straight from the database (see work/subs.json)
SUB = json.load(open('work/subs.json', encoding='utf-8'))


def col(r, *names):
    for n in names:
        v = r.get('c_' + n)
        if v not in (None, '', '-'):
            return v.strip()
    return None


FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


def fa(s):
    return str(s).translate(FA) if s is not None else None


# The catalog already stores inch sizes as «۱¼ اینچ» / «۲½ اینچ», so mixed
# numbers are folded to the vulgar fraction rather than left as «۱ ۱/۴».
_MIXED = [('1 1/4', '۱¼'), ('1 1/2', '۱½'), ('1 3/4', '۱¾'), ('2 1/2', '۲½'),
          ('3 1/2', '۳½'), ('1 1/8', '۱⅛'), ('1 3/8', '۱⅜'), ('1 5/8', '۱⅝'),
          ('2 5/8', '۲⅝')]


def fa_size(s):
    """Normalise an ahanonline size token into the shape our catalog stores:
    Persian digits, «×» between box dimensions, «اینچ» kept."""
    if not s:
        return None
    s = re.sub(r'\s+', ' ', s.strip().strip('"').strip())
    s = s.replace('*', '×')
    for a, b in _MIXED:
        if s.startswith(a):
            s = b + s[len(a):]
            break
    s = s.translate(FA)
    return re.sub(r'\s*×\s*', '×', s).strip()


out = []          # the SKU plan
notes = []        # per-sub-category outcome for the report


# composeSkuSlug drops any character outside [a-z0-9-], which turns «۱¼ اینچ»
# and «۲½ اینچ» into the same bare `1`/`2`. Expanding the vulgar fraction first
# keeps the URL readable and distinct; the DISPLAY size still stores «۱¼ اینچ».
_VULGAR = {'¼': '-1-4', '½': '-1-2', '¾': '-3-4', '⅛': '-1-8', '⅜': '-3-8',
           '⅝': '-5-8', '⅞': '-7-8'}


def slug_size(size):
    if not size:
        return size
    out = normalize_digits(size)
    for k, v in _VULGAR.items():
        out = out.replace(k, v)
    return out


EXISTING_SLUGS = {x['slug'] for x in json.load(open('work/our_skus.json', encoding='utf-8'))}
USED = set()


def add(sub_key, size=None, grade=None, standard=None, dimensions=None, factory=None,
        unit='kg', price=None, src='', name_override=None):
    s = SUB[sub_key]
    name = name_override or compose_sku_name(s['name'], size, factory)
    # composeSkuSlug keyed on category alone is not unique across these new
    # sub-categories — «سیم‌جوش استیل ۳ / 304L» and «سیم‌مفتول استیل ۳ / 304L»
    # both reduce to `wire-3-304l` — so the sub-category slug joins the prefix.
    prefix = '%s-%s' % (s['cat_slug'], s['slug'])
    slug = compose_sku_slug(prefix, slug_size(size), grade, factory)
    if slug in USED or slug in EXISTING_SLUGS:
        slug2 = slug
        extra = dimensions or standard
        if extra:
            slug2 = slug + '-' + compose_sku_slug('', slug_size(extra))
        n, cand = 2, slug2
        while cand in USED or cand in EXISTING_SLUGS:
            cand = '%s-%d' % (slug2, n)
            n += 1
        slug = cand
    USED.add(slug)
    out.append({
        'sub_key': sub_key, 'sub_id': s['id'], 'cat_id': s['cat_id'], 'cat_slug': s['cat_slug'],
        'sub_name': s['name'], 'cat_name': s['cat_name'],
        'name': name, 'slug': slug, 'size': size, 'grade': grade, 'standard': standard,
        'dimensions': dimensions, 'factory': factory, 'unit': unit, 'price': int(round(price)),
        'source': src,
    })


def med(rows):
    return statistics.median([r['price_toman'] for r in rows])


# ---------------------------------------------------------------- میلگرد
# 1) میلگرد حرارتی — ahanonline's own حرارتی page; its row names read
#    «میلگرد ساده … کلاف», which is what that line is rolled from.
seen = {}
for r in by_key['rebar/heat-treated']:
    m = re.search(r'میلگرد ساده\s+([\d.]+)\s+(\S+)', r['name'])
    if not m:
        continue
    size, brand = m.group(1), m.group(2)
    deliv = 'کارخانه' if 'کارخانه' in r['name'] else 'تهران'
    k = (size, brand)
    if k not in seen or deliv == 'کارخانه':
        seen[k] = r
for (size, brand), r in sorted(seen.items()):
    add('rebar/heat-treated', size=fa_size(size), factory=brand, unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('میلگرد حرارتی', len(seen), 'ahanonline میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی'))

# 2) کوپلر میلگرد — refused: ahanonline prices it per «عدد» and PRICE_UNITS has
#    no piece unit (kg | branch | sheet | meter). Reported, not invented.
notes.append(('کوپلر میلگرد', 0, 'REFUSED — priced per عدد; schema has no piece unit'))

# 3) میلگرد استیل
seen = {}
for r in by_key['rebar/stainless']:
    size, alloy = col(r, 'size', 'سایز'), col(r, 'standard', 'استاندارد', 'آلیاژ')
    if not size or not alloy:
        continue
    # the brand is the Persian token immediately before the alloy code
    m = re.search(r'([؀-ۿ]+)\s+' + re.escape(alloy), r['name'])
    brand = m.group(1) if m else None
    seen.setdefault((alloy, size), (r, brand))
for (alloy, size), (r, brand) in sorted(seen.items(), key=lambda kv: (kv[0][0], float(kv[0][1]))):
    add('rebar/stainless', size=fa_size(size), grade=alloy, factory=brand, unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('میلگرد استیل', len(seen), 'ahanonline میلگرد/میلگرد-استیل'))

# ---------------------------------------------------------------- کلاف و مفتول
# 4) سیم‌جوش استیل — the 304L / 2 mm row prints 401,087 against 1,545,454 for
#    every other 304L size; a 3.9× break on one cell is a data error on their
#    side, so it is excluded rather than published.
grp = collections.defaultdict(list)
for r in by_key['wire/welding-wire']:
    grp[col(r, 'آلیاژ')].append(r)
excluded = []
for alloy, rows in sorted(grp.items()):
    ps = [x['price_toman'] for x in rows]
    m = statistics.median(ps)
    for r in rows:
        if r['price_toman'] < m * 0.5 or r['price_toman'] > m * 2:
            excluded.append(r['name'].strip())
            continue
        add('wire/welding-wire', size=fa_size(col(r, 'سایز')), grade=alloy, unit='kg',
            price=r['price_toman'], src=r['name'].strip())
notes.append(('سیم‌جوش استیل', sum(1 for x in out if x['sub_key'] == 'wire/welding-wire'),
              'ahanonline میلگرد/سیم-جوش-استیل — excluded %d outlier row(s): %s'
              % (len(excluded), '; '.join(excluded) or '—')))

# 5) سیم‌مفتول استیل
for r in sorted(by_key['wire/wire-rod'], key=lambda x: (col(x, 'آلیاژ') or '', float(col(x, 'سایز') or 0))):
    add('wire/wire-rod', size=fa_size(col(r, 'سایز')), grade=col(r, 'آلیاژ'), unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('سیم‌مفتول استیل', sum(1 for x in out if x['sub_key'] == 'wire/wire-rod'),
              'ahanonline میلگرد/سیم-مفتول-استیل'))

# ---------------------------------------------------------------- ورق
# 6) گریتینگ — four product lines, each priced flat across its bar patterns.
grp = collections.defaultdict(list)
for r in by_key['sheet/grating']:
    t = r['group'].replace('گریتینگ', '').strip()
    grp[t].append(r)
for t, rows in sorted(grp.items()):
    add('sheet/grating', grade=t, unit='kg', price=med(rows),
        name_override='گریتینگ ' + t,
        src='%s (%d rows, %s)' % (rows[0]['group'], len(rows), 'کارخانه'))
notes.append(('گریتینگ', len(grp), 'ahanonline انواع-ورق/گریتینگ'))

# 7) آلوزینک (گالوالوم)
for r in sorted(by_key['sheet/aluzinc'], key=lambda x: (float(col(x, 'ضخامت')), col(x, 'عرض'))):
    add('sheet/aluzinc', size=fa_size(col(r, 'ضخامت')), dimensions=fa(col(r, 'عرض')),
        factory='هفت‌الماس', unit='kg', price=r['price_toman'], src=r['name'].strip())
notes.append(('آلوزینک (گالوالوم)', len(by_key['sheet/aluzinc']), 'ahanonline انواع-ورق/آلوزینک'))

# 8) قلع‌اندود
for r in sorted(by_key['sheet/tin-coated'], key=lambda x: float(col(x, 'ضخامت'))):
    add('sheet/tin-coated', size=fa_size(col(r, 'ضخامت')), dimensions=fa_size(col(r, 'سایز')),
        factory='فولاد مبارکه', unit='kg', price=r['price_toman'], src=r['name'].strip())
notes.append(('قلع‌اندود', len(by_key['sheet/tin-coated']), 'ahanonline انواع-ورق/قلع-اندود'))

# 9) ورق پانچ سیاه — quoted per SHEET (3.23 M for a 2 mm 1000×2000 plate is
#    102,765 T/kg, in line with their ورق سیاه), so unit = 'sheet'.
for r in by_key['sheet/perforated-black']:
    add('sheet/perforated-black', size=fa_size(col(r, 'ضخامت (mm)')),
        dimensions=fa_size(col(r, 'ابعاد (mm)')), factory='فولاد مبارکه', unit='sheet',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('ورق پانچ سیاه', len(by_key['sheet/perforated-black']),
              'ahanonline انواع-ورق/ورق-پانچ-سیاه — quoted per برگ, unit=sheet'))

# 10) ورق ضد سایش
for r in sorted(by_key['sheet/wear-resistant'], key=lambda x: float(col(x, 'ضخامت'))):
    add('sheet/wear-resistant', size=fa_size(col(r, 'ضخامت')), dimensions=fa_size(col(r, 'سایز')),
        standard='ضد سایش', factory=col(r, 'برند'), unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('ورق ضد سایش', len(by_key['sheet/wear-resistant']), 'ahanonline انواع-ورق/ورق-ضد-سایش'))

# 11) ورق دریایی
for r in sorted(by_key['sheet/marine'], key=lambda x: float(col(x, 'ضخامت'))):
    add('sheet/marine', size=fa_size(col(r, 'ضخامت')), dimensions=fa_size(col(r, 'سایز')),
        grade='A36', factory='فولاد مبارکه', unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('ورق دریایی', len(by_key['sheet/marine']), 'ahanonline انواع-ورق/ورق-دریایی'))

# ---------------------------------------------------------------- لوله
# 12) لوله جدار چاه — ahanonline lists 3 wall thicknesses per (size, mill) at
#     prices within 0.6 % of each other, so one SKU per (size, mill) at the
#     median; the wall is not a price axis here.
grp = collections.defaultdict(list)
for r in by_key['pipe/well-casing']:
    grp[(col(r, 'برند'), col(r, 'سایز'))].append(r)
for (brand, size), rows in sorted(grp.items(), key=lambda kv: (kv[0][0], float(kv[0][1].split()[0]))):
    add('pipe/well-casing', size=fa_size(size), standard='ST37', factory=brand, unit='kg',
        price=med(rows), src='%s — median of %d wall thicknesses' % (rows[0]['name'].strip(), len(rows)))
notes.append(('لوله جدار چاه', len(grp), 'ahanonline انواع-لوله/لوله-جدار-چاه'))

# 13) لوله گوشت‌دار
for r in by_key['pipe/thick-walled']:
    brand = 'وارداتی' if 'وارداتی' in r['name'] else ('چین' if 'چین' in r['name'] else None)
    add('pipe/thick-walled', size=fa_size(col(r, 'سایز')), factory=brand, unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('لوله گوشت‌دار', len(by_key['pipe/thick-walled']), 'ahanonline انواع-لوله/لوله-گوشتدار'))

# ---------------------------------------------------------------- پروفیل
# 14) پروفیل کنگره
for r in by_key['profile/congress']:
    brand = None
    for cand in ('نورد میلاد یزد', 'متفرقه', 'تهران'):
        if cand in r['name']:
            brand = cand
            break
    add('profile/congress', size=fa_size(col(r, 'سایز')), factory=brand, unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('پروفیل کنگره', len(by_key['profile/congress']), 'ahanonline انواع-پروفیل/پروفیل-کنگره'))

# ---------------------------------------------------------------- نبشی و ناودانی
# 15) وال پست — priced per piece (a 20×300 runs 2.37 M against 108 k for a
#     10×20 at the same 2 mm wall), so unit = 'branch'.
for r in sorted(by_key['angle-channel/val-post'], key=lambda x: x['price_toman']):
    add('angle-channel/val-post', size=fa_size(col(r, 'سایز')), grade='ضخامت ۲', unit='branch',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('وال پست', len(by_key['angle-channel/val-post']),
              'ahanonline نبشی-و-ناودانی/وال-پست — priced per شاخه, unit=branch'))

# ---------------------------------------------------------------- استیل
# 16) لوله استیل — the صنعتی rows (رده 10/40/80). Schedule moves the price by
#     ~2 %, so one SKU per (alloy, size) at the median across schedules.
grp = collections.defaultdict(list)
for r in by_key['steel/pipe']:
    if 'صنعتی' not in r['name']:
        continue
    alloy = '316L' if '316' in r['name'] else ('304' if '304' in r['name'] else None)
    size = col(r, 'سایز')
    if not alloy or not size:
        continue
    grp[(alloy, size)].append(r)


def inch_key(s):
    s = s.replace('"', '').replace('اینچ', '').strip()
    parts = s.split()
    tot = 0.0
    for p in parts:
        if '/' in p:
            a, b = p.split('/')
            tot += float(a) / float(b)
        else:
            try:
                tot += float(p)
            except ValueError:
                pass
    return tot


for (alloy, size), rows in sorted(grp.items(), key=lambda kv: (kv[0][0], inch_key(kv[0][1]))):
    add('steel/pipe', size=fa_size(size if 'اینچ' in size else size + ' اینچ'), grade=alloy, unit='kg',
        price=med(rows), src='%s — median of %d schedules' % (rows[0]['name'].strip(), len(rows)))
notes.append(('لوله استیل', len(grp), 'ahanonline استنلس-استیل/لوله-استیل (صنعتی rows)'))

# 17) پروفیل استیل — decorative + industrial, one SKU per (alloy, section).
grp = collections.defaultdict(list)
for k in ('steel/profile', 'steel/profile-decorative', 'steel/profile-industrial'):
    for r in by_key[k]:
        grp[(col(r, 'آلیاژ'), col(r, 'ابعاد'))].append(r)
for (alloy, dims), rows in sorted(grp.items()):
    add('steel/profile', size=fa_size(dims), grade=alloy, unit='kg', price=med(rows),
        src='%s — median of %d thicknesses' % (rows[0]['name'].strip(), len(rows)))
notes.append(('پروفیل استیل', len(grp), 'ahanonline استنلس-استیل/پروفیل-استیل (+ دکوراتیو، صنعتی)'))

# 18) نبشی استیل
for r in by_key['steel/angle']:
    add('steel/angle', size=fa_size(col(r, 'سایز')), grade=col(r, 'آلیاژ'), factory='چین',
        unit='kg', price=r['price_toman'], src=r['name'].strip())
notes.append(('نبشی استیل', len(by_key['steel/angle']), 'ahanonline استنلس-استیل/نبشی-استیل'))

# 19) ناودانی استیل
for r in by_key['steel/channel']:
    add('steel/channel', size=fa_size(col(r, 'سایز')), grade=col(r, 'آلیاژ'), factory='تایوان',
        unit='kg', price=r['price_toman'], src=r['name'].strip())
notes.append(('ناودانی استیل', len(by_key['steel/channel']), 'ahanonline استنلس-استیل/ناودانی-استیل'))

for label, key in (('تسمه استنلس استیل', 'steel/strip'), ('توری استنلس استیل', 'steel/wire-mesh'),
                   ('مش استنلس استیل', 'steel/mesh'), ('تیوب استنلس استیل', 'steel/tube'),
                   ('رینگ استنلس استیل', 'steel/ring'), ('فلنج استنلس استیل', 'steel/flange'),
                   ('فنر استنلس استیل', 'steel/spring')):
    notes.append((label, 0, 'ahanonline lists 0 products on that page («هیچ موردی … یافت نشد»)'))

# ---------------------------------------------------------------- فلزات رنگی
# 20) لوله مسی — sold per coil; the 15-متری coil is the standard product line
#     (the handful of 6-متری rows are a different length and are left out).
seen = {}
for r in by_key['felezat-rangi/copper-pipe']:
    if col(r, 'حالت') != '15 متری':
        continue
    brand = r['group'].replace('لوله مسی', '').strip()
    size, th = col(r, 'size'), col(r, 'ضخامت')
    if not size or not th:
        continue
    seen.setdefault((brand, size, th), r)
for (brand, size, th), r in sorted(seen.items(), key=lambda kv: (kv[0][0], kv[0][2], inch_key(kv[0][1]))):
    add('felezat-rangi/copper-pipe', size=fa_size(size + ' اینچ'), grade='ضخامت ' + fa(th),
        standard='کویل ۱۵ متری', factory=brand, unit='branch', price=r['price_toman'],
        src=r['name'].strip())
notes.append(('لوله مسی', len(seen),
              'ahanonline انواع-لوله/لوله-مسی — 15-متری coils only, priced per کویل (unit=branch)'))

# 21) تسمه مسی
seen = {}
for r in by_key['felezat-rangi/copper-strip']:
    m = re.search(r'تسمه مسی\s+([\d]+\*[\d]+)', r['name'])
    if m:
        seen.setdefault(m.group(1), r)
for size, r in sorted(seen.items()):
    add('felezat-rangi/copper-strip', size=fa_size(size), standard='شاخه ۴ متری', unit='kg',
        price=r['price_toman'], src=r['name'].strip())
notes.append(('تسمه مسی', len(seen), 'ahanonline انواع-ورق/تسمه-مسی'))

# 22) ورق مسی
for r in sorted(by_key['felezat-rangi/copper-sheet'], key=lambda x: float(col(x, 'ضخامت'))):
    add('felezat-rangi/copper-sheet', size=fa_size(col(r, 'ضخامت')), factory=col(r, 'برند'),
        unit='kg', price=r['price_toman'], src=r['name'].strip())
notes.append(('ورق مسی', len(by_key['felezat-rangi/copper-sheet']), 'ahanonline انواع-ورق/ورق-مسی'))

for label in ('لوله آلومینیوم', 'میلگرد آلومینیوم', 'سپری آلومینیوم', 'نبشی آلومینیوم',
              'سیم‌جوش آلومینیوم', 'میلگرد مسی', 'بوشن مسی'):
    notes.append((label, 0, 'ahanonline lists 0 products on that page («هیچ موردی … یافت نشد»)'))

json.dump({'skus': out, 'notes': notes}, open('work/plan_b.json', 'w'), ensure_ascii=False, indent=1)

print('new SKUs:', len(out))
for k, v in sorted(collections.Counter(x['sub_name'] for x in out).items()):
    print('  %-24s %d' % (k, v))
dupes = [k for k, v in collections.Counter(x['slug'] for x in out).items() if v > 1]
print('duplicate slugs in plan:', dupes[:10], len(dupes))
