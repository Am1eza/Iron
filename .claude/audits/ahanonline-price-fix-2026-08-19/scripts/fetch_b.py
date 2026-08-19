"""Fetch the ahanonline product-category pages the 2026-08-19 comparison pass did not
cover: the 35 newly-activated sub-categories, plus a re-fetch of هاش for the domestic
question. Same rules as that pass — /product-category/* only (robots.txt allows it),
one request every ~3.5 s, real browser UA."""
import urllib.request, urllib.parse, time, os, hashlib, json

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
BASE = "https://ahanonline.com/product-category/"

# (our sub-category key, ahanonline path)
TARGETS = [
    # میلگرد
    ("rebar/heat-treated", "میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی"),
    ("rebar/coupler", "میلگرد/کوپلر"),
    ("rebar/stainless", "میلگرد/میلگرد-استیل"),
    # کلاف و مفتول
    ("wire/welding-wire", "میلگرد/سیم-جوش-استیل"),
    ("wire/welding-wire2", "میلگرد/سیم-جوش-استیل/سیم-جوش-استنلس-استیل"),
    ("wire/wire-rod", "میلگرد/سیم-مفتول-استیل"),
    # ورق
    ("sheet/grating", "انواع-ورق/گریتینگ"),
    ("sheet/grating-metal", "انواع-ورق/گریتینگ/گریتینگ-فلزی"),
    ("sheet/grating-galv", "انواع-ورق/گریتینگ/گریتینگ-گالوانیزه"),
    ("sheet/grating-stair", "انواع-ورق/گریتینگ/گریتینگ-پله"),
    ("sheet/aluzinc", "انواع-ورق/آلوزینک"),
    ("sheet/aluzinc-galvalum", "انواع-ورق/آلوزینک/ورق-گالوالوم"),
    ("sheet/tin-coated", "انواع-ورق/قلع-اندود"),
    ("sheet/perforated-black", "انواع-ورق/ورق-پانچ-سیاه"),
    ("sheet/wear-resistant", "انواع-ورق/ورق-ضد-سایش"),
    ("sheet/marine", "انواع-ورق/ورق-دریایی"),
    # لوله
    ("pipe/well-casing", "انواع-لوله/لوله-جدار-چاه"),
    ("pipe/well-casing-tehranshargh", "انواع-لوله/لوله-جدار-چاه/جدار-چاه-تهران-شرق"),
    ("pipe/well-casing-kaloup", "انواع-لوله/لوله-جدار-چاه/لوله-جدار-چاه-کالوپ"),
    ("pipe/well-casing-kianpersia", "انواع-لوله/لوله-جدار-چاه/لوله-جدار-چاه-کیان-پرشیا"),
    ("pipe/thick-walled", "انواع-لوله/لوله-گوشتدار"),
    # پروفیل
    ("profile/congress", "انواع-پروفیل/پروفیل-کنگره"),
    # نبشی و ناودانی
    ("angle-channel/val-post", "نبشی-و-ناودانی/وال-پست"),
    # استیل (11)
    ("steel/pipe", "استنلس-استیل/لوله-استیل"),
    ("steel/pipe-industrial", "استنلس-استیل/لوله-استیل/لوله-استیل-صنعتی"),
    ("steel/pipe-decorative", "استنلس-استیل/لوله-استیل/لوله-استیل-دکوراتیو"),
    ("steel/profile", "استنلس-استیل/پروفیل-استیل"),
    ("steel/profile-decorative", "استنلس-استیل/پروفیل-استیل/پروفیل-استیل-دکوراتیو"),
    ("steel/profile-industrial", "پروفیل-استنلس-استیل-صنعتی"),
    ("steel/angle", "استنلس-استیل/نبشی-استیل"),
    ("steel/channel", "استنلس-استیل/ناودانی-استیل"),
    ("steel/strip", "استنلس-استیل/تسمه-استنلس-استیل"),
    ("steel/wire-mesh", "استنلس-استیل/توری-استنلس-استیل"),
    ("steel/mesh", "استنلس-استیل/مش-استنلس-استیل"),
    ("steel/tube", "استنلس-استیل/تویوب-استنلس-استیل"),
    ("steel/ring", "استنلس-استیل/رینگ-استنلس-استیل"),
    ("steel/flange", "استنلس-استیل/فلنج-استنلس-استیل"),
    ("steel/spring", "استنلس-استیل/فنر-استنلس-استیل"),
    ("steel/root", "استنلس-استیل"),
    # فلزات رنگی (10)
    ("felezat-rangi/aluminum-pipe", "آلومینیوم/لوله-آلومینیوم"),
    ("felezat-rangi/aluminum-rebar", "آلومینیوم/میلگرد-آلومینیوم"),
    ("felezat-rangi/aluminum-flat-bar", "آلومینیوم/سپری-آلومینیوم"),
    ("felezat-rangi/aluminum-angle", "آلومینیوم/نبشی-آلومینیوم"),
    ("felezat-rangi/aluminum-welding-wire", "آلومینیوم/سیم-جوش-آلومینیوم"),
    ("felezat-rangi/aluminum-root", "آلومینیوم"),
    ("felezat-rangi/copper-pipe", "انواع-لوله/لوله-مسی"),
    ("felezat-rangi/copper-strip", "انواع-ورق/تسمه-مسی"),
    ("felezat-rangi/copper-sheet", "انواع-ورق/ورق-مسی"),
    ("felezat-rangi/copper-rebar", "میلگرد-مسی"),
    ("felezat-rangi/copper-bushing", "بوشن-مسی"),
    ("felezat-rangi/copper-root", "مس"),
    # re-fetch for the هاش domestic question
    ("ibeam/hash", "تیرآهن-و-هاش/هاش"),
    ("ibeam/tirahan", "تیرآهن-و-هاش/تیرآهن"),
]

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pages_b")
os.makedirs(OUT, exist_ok=True)
manifest = []
for key, path in TARGETS:
    url = BASE + urllib.parse.quote(path) + "/"
    fn = os.path.join(OUT, hashlib.md5(path.encode()).hexdigest()[:10] + ".html")
    if os.path.exists(fn) and os.path.getsize(fn) > 5000:
        manifest.append([key, path, fn, "cached"])
        print(manifest[-1], flush=True)
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fa-IR,fa;q=0.9"})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", "replace")
        open(fn, "w", encoding="utf-8").write(body)
        manifest.append([key, path, fn, "ok %d" % len(body)])
    except Exception as e:
        manifest.append([key, path, fn, "ERR %s" % e])
    print(manifest[-1], flush=True)
    time.sleep(3.5)

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), ensure_ascii=False, indent=1)
print("DONE", len(manifest))
