"""Python port of web/src/lib/utils/{slugify,catalogCompose}.ts.

Ported rather than called because there is no node on this host's PATH and the
worktree has no node_modules; `check_compose.py` re-derives the slug and name of
every SKU already in the database and asserts this port reproduces them, so the
port is pinned to the real implementation rather than trusted.
"""
import re

MAP = {
    'آ': 'a', 'ا': 'a', 'أ': 'a', 'إ': 'e', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's',
    'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
    'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm',
    'ن': 'n', 'و': 'v', 'ه': 'h', 'ة': 'h', 'ی': 'y', 'ي': 'y', 'ئ': 'y', 'ء': '',
    '‌': '-',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7',
    '۸': '8', '۹': '9',
}

FACTORY_SLUG = {
    'ذوب‌آهن اصفهان': 'zobahan', 'ذوب آهن اصفهان': 'zobahan',
    'فولاد کویر کاشان': 'kavir-kashan', 'فولاد میانه': 'mianeh',
    'فولاد نیشابور': 'neyshabour', 'ظفر بناب': 'zafar-bonab',
    'فولاد شاهرود': 'shahroud', 'آریان فولاد': 'aryan',
    'امیرکبیر خزر': 'amirkabir-khazar', 'سیادن ابهر': 'siadan-abhar',
    'راد همدان': 'rad-hamedan', 'فایکو': 'faico', 'یزد احرامیان': 'yazd-ahramian',
    'فولاد اهواز': 'ahvaz', 'ماهان سپاهان': 'mahan-sepahan',
    'جهان فولاد غرب': 'jahan-foolad-gharb', 'جهان پروفیل پارس': 'jahan-profile-pars',
    'تهران شرق': 'tehran-shargh', 'نیکان پروفیل': 'nikan', 'کیان پرشیا': 'kian-persia',
    'پروفیل صابری': 'saberi', 'پروفیل یاران': 'yaran', 'فولاد مشهد': 'mashhad',
    'پایا اصفهان': 'paya-esfahan', 'فولاد مبارکه': 'mobarakeh', 'فولاد سبا': 'saba',
    'اکسین اهواز': 'oxin-ahvaz', 'کاویان اهواز': 'kavian-ahvaz',
    'قطعات اصفهان': 'ghataat-esfahan', 'فولاد گیلان': 'gilan', 'هفت‌الماس': 'haft-almas',
    'ورق شهرکرد': 'shahrekord', 'تاراز': 'taraz', 'امیرکبیر کاشان': 'amirkabir-kashan',
    'ناب تبریز': 'nab-tabriz', 'شکفته مشهد': 'shokoufteh-mashhad',
    'سپهر ایرانیان': 'sepehr-iranian', 'جاوید بناب': 'javid-bonab',
    'ظهوریان مشهد': 'zohourian-mashhad', 'دهشیر یزد': 'dehshir-yazd',
    'لوله سپاهان': 'sepahan-pipe', 'سپنتا': 'sepanta', 'نورد لوله ساوه': 'saveh-pipe',
    'درپاد تهران': 'derpad-tehran', 'کالوپ': 'kaloup', 'لوله سمنان': 'semnan-pipe',
    'لوله‌سازی اهواز': 'ahvaz-pipe', 'فولاد نطنز': 'natanz',
    'جهان فولاد سیرجان': 'jahan-foolad-sirjan', 'آناهیتا گیلان': 'anahita-gilan',
}

_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')


def normalize_digits(s):
    return (s or '').translate(_DIGITS)


def slugify(s):
    translit = ''.join(MAP.get(ch, ch) for ch in (s or '').strip().lower())
    translit = re.sub(r'[^a-z0-9-]+', '-', translit)
    translit = re.sub(r'-+', '-', translit)
    return translit.strip('-')


def factory_slug(f):
    key = (f or '').strip()
    return FACTORY_SLUG.get(key, slugify(key))


def compose_sku_slug(category_slug, size=None, grade=None, factory=None):
    parts = [
        category_slug,
        normalize_digits(size).replace('×', 'x') if size else '',
        slugify(grade) if grade else '',
        factory_slug(factory) if factory else '',
    ]
    s = '-'.join(p for p in parts if p)
    s = re.sub(r'[^a-z0-9-]+', '-', s, flags=re.I)
    s = re.sub(r'-+', '-', s)
    return s.strip('-').lower()


def compose_sku_name(sub_name=None, size=None, factory=None):
    return ' '.join(p.strip() for p in (sub_name, size, factory) if p and p.strip())
