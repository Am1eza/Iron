"""Re-fetch, live, the ahanonline category pages the sample verification needs,
so the written prices are checked against the site as it is right now rather
than against the 2026-08-19 dump they came from."""
import urllib.request, urllib.parse, time, os, hashlib, json

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
BASE = "https://ahanonline.com/product-category/"
PATHS = [
    'میلگرد/قیمت-میلگرد',
    'میلگرد/میلگرد-ساده',
    'میلگرد/قیمت-میلگرد/میلگرد-کلاف',
    'نبشی-و-ناودانی/نبشی',
    'نبشی-و-ناودانی/ناودانی',
    'انواع-پروفیل/پروفیل',
    'انواع-پروفیل/پروفیل-گالوانیزه',
    'انواع-پروفیل/پروفیل-مبلی',
    'انواع-ورق/ورق-سیاه',
    'انواع-ورق/ورق-روغنی',
    'انواع-ورق/ورق-گالوانیزه',
    'انواع-ورق/ورق-آجدار',
    'انواع-ورق/ورق-st52',
    'انواع-ورق/عرشه-فولادی-گالوانیزه',
    'انواع-لوله/لوله-گالوانیزه',
    'انواع-لوله/لوله-آهنی-سیاه',
    'انواع-لوله/لوله-داربستی',
    'محصولات-مفتولی/سیم-مفتول',
    'محصولات-مفتولی/مش',
    'محصولات-مفتولی/سیم-آرماتور',
]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pages_verify')
os.makedirs(OUT, exist_ok=True)
man = []
for path in PATHS:
    url = BASE + urllib.parse.quote(path) + '/'
    fn = os.path.join(OUT, hashlib.md5(path.encode()).hexdigest()[:10] + '.html')
    if os.path.exists(fn) and os.path.getsize(fn) > 5000:
        man.append([path, path, fn, 'cached']); print(man[-1], flush=True); continue
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'fa-IR,fa;q=0.9'})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode('utf-8', 'replace')
        open(fn, 'w', encoding='utf-8').write(body)
        man.append([path, path, fn, 'ok %d' % len(body)])
    except Exception as e:
        man.append([path, path, fn, 'ERR %s' % e])
    print(man[-1], flush=True)
    time.sleep(3.5)
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
print('DONE')
