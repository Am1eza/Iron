# آنالیتیکس آهن‌تایم

**وضعیت: راه‌اندازی‌شده و فعال.** این سند می‌گوید چه چیزی برقرار است، کجا تنظیم
شده، و اگر روزی سرور از نو ساخته شد چه چیزهایی باید دوباره اعمال شود.

## ۱) Matomo — آنالیتیکس اصلی (خودمیزبان، داخل ایران کار می‌کند) ✅

سرویس‌های `matomo` و `matomo-db` در docker-compose بالا هستند. اسکریپت ردیاب از
مسیر **هم‌مبدأ** `/mt/` سرو می‌شود (Caddyfile)، پس نه CSP تغییر می‌کند، نه چیزی
از دامنهٔ ما خارج می‌شود، نه تحریم/فیلتر رویش اثر دارد.

- **کنسول مدیریت:** `https://ahantime.com:8443`
- **شناسهٔ سایت:** `1` — در `.env` روی `MATOMO_SITE_ID=1` تنظیم شده.
- **حریم خصوصی:** ناشناس‌سازی IP فعال؛ دسترسی مهمان/عمومی به آمار بسته.

### نکتهٔ مهم دربارهٔ نحوهٔ تزریق اسکریپت
اسکریپت ردیاب **در زمان build جاسازی نمی‌شود** — آن روش باگ داشت: تقریباً همهٔ
صفحات هنگام ساخت ایمیج از پیش رندر می‌شوند و `MATOMO_SITE_ID` یک متغیر زمان
اجراست که در CI وجود ندارد، پس «آمار خاموش» در HTML همهٔ صفحات ثابت پخته می‌شد
(روی سایت زنده تأیید شد: ردیاب در `/`، `/contact`، `/about`، `/prices` و
`/market` غایب بود). اکنون `<script src="/api/analytics/script">` همیشه و ثابت
در صفحه هست و آن مسیر (`web/src/app/api/analytics/script/route.ts`،
`force-dynamic`) در لحظهٔ درخواست تصمیم می‌گیرد ردیاب را بدهد یا فایل خالی.
**نتیجه: تغییر `MATOMO_SITE_ID` فقط restart می‌خواهد، نه rebuild.**

### هدف‌های تبدیل (Goals)
سه هدف روی سایت ۱ تعریف شده و از داخل کد فعال می‌شوند
(`web/src/lib/analytics/track.ts`). تطبیق بر اساس **event category دقیق** است —
تغییر این رشته‌ها یعنی قطع شدن بی‌صدای ثبت تبدیل:

| category | هدف | نقطهٔ فراخوانی |
|---|---|---|
| `lead` | درخواست قیمت / استعلام | `components/forms/RequestFlow.tsx` — موفقیت ثبت سرنخ |
| `ai-chat` | شروع گفتگو با مشاور هوشمند | `components/ai/AdvisorChat.tsx` — فقط اولین پیام |
| `contact` | تماس با ما | `components/forms/ContactForm.tsx` — ارسال موفق |

### آرشیو گزارش‌ها (cron) — تنظیم سمت سرور
`enable_browser_archiving_triggering = 0` در `config.ini.php` خاموش شده و یک
cron ساعتی روی **هاست** گزارش‌ها را می‌سازد:

```
17 * * * * cd /opt/ahantime && /usr/bin/docker compose exec -T -u www-data matomo \
  php /var/www/html/console core:archive --url=https://ahantime.com/ >> /var/log/matomo-archive.log 2>&1
```

بدون این، اولین بازدیدکننده بعد از هر دورهٔ سکوت هزینهٔ کل آرشیو را می‌پردازد و
با بزرگ شدن داده‌ها گزارش‌ها timeout می‌گیرند.

### تنظیمات پروکسی در `config.ini.php`
چون Matomo پشت Caddy (و Cloudflare) است:

```
trusted_hosts[] = "matomo"
trusted_hosts[] = "ahantime.com"
trusted_hosts[] = "ahantime.com:8443"
assume_secure_protocol = 1
proxy_client_headers[] = "HTTP_X_FORWARDED_FOR"
proxy_host_headers[] = "HTTP_X_FORWARDED_HOST"
```

> اگر بعد از فعال‌کردن پروکسی Cloudflare دیدید IP همهٔ بازدیدکنندگان یکسان گزارش
> می‌شود، همین بخش باید با هدر `CF-Connecting-IP` تطبیق داده شود.

## ۲) Google Search Console ✅

مالکیت دامنه با **رکورد TXT در DNS (Cloudflare)** تأیید شده — نه با تگ HTML.
برای همین **هیچ کدی داخل سایت لازم نیست** و به دیپلوی وابسته نیست.

```
TXT  ahantime.com  →  google-site-verification=…
```

⚠️ این رکورد را حذف نکنید؛ گوگل دوره‌ای دوباره چک می‌کند.
sitemap در `https://ahantime.com/sitemap.xml` فعال است و در بخش Sitemaps ثبت
می‌شود. پنل ادمین عمداً از دید گوگل مخفی است (`robots.txt` + هدر noindex).

`GSC_VERIFICATION` در env هنوز پشتیبانی می‌شود ولی **استفاده نمی‌شود**؛ اگر روزی
به روش تگ HTML رفتید، توکن را مستقیم در کد commit کنید نه در env — دقیقاً به
همان دلیل پیش‌رندر که بالا توضیح داده شد.

## ۳) Google Analytics 4 / Tag Manager — عمداً فعال نشده ⛔

کد پشتیبانی‌اش در `components/analytics/Analytics.tsx` هست و با ست‌کردن
`GA4_ID` یا `GTM_ID` + **rebuild** فعال می‌شود (این دو دامنه‌های CSP را باز
می‌کنند، پس زمان build لازم دارند).

دلیل فعال‌نشدن یک تصمیم آگاهانه است:

- گوگل در دی ۱۴۰۳ حساب‌های Google Analytics کاربران ایرانی را به‌دلیل تحریم
  **معلق کرد** — ریسک از دست رفتن یک‌بارهٔ کل داده.
- اسکریپت از `googletagmanager.com` بارگذاری می‌شود؛ بخشی از کاربران داخل ایران
  اصلاً دریافتش نمی‌کنند → هم داده از دست می‌رود، هم صفحه کندتر می‌شود.

Matomo همان کار را بدون این دو ریسک انجام می‌دهد. اگر روزی برای Google Ads لازم
شد، GTM را فعال کنید (نه GA4 تنها) تا تیم مارکتینگ بتواند تگ‌های بعدی را بدون
دخالت توسعه‌دهنده اضافه کند.

## خلاصهٔ متغیرها (`.env`)

```
MATOMO_SITE_ID=1       # فعال — تغییرش فقط restart می‌خواهد
GSC_VERIFICATION=      # خالی و لازم نیست (تأیید از راه DNS انجام شده)
GA4_ID=                # عمداً خالی — بخش ۳ را بخوانید
GTM_ID=                # عمداً خالی — بخش ۳ را بخوانید
```

## ۴) افزونهٔ MarketingCampaignsReporting در Matomo — نصب‌شده ✅

**وضعیت:** نسخهٔ ۵.۲.۲، مجوز GPL-3.0+، نصب و فعال روی سرور (مرداد ۱۴۰۵).

**چرا:** Matomo در حالت پیش‌فرض هر پنج پارامتر کمپین (`utm_source`،
`utm_medium`، `utm_campaign`، `utm_term`، `utm_content`) را در یک رشتهٔ واحد
جمع می‌کند. این افزونه آن‌ها را به شش بُعد جداگانه تفکیک می‌کند (منبع، واسط،
محتوا، گروه، جایگاه، و ترکیب منبع/واسط)، پس می‌شود پرسید «اینستاگرام در برابر
گوگل» نه فقط «کمپین تابستان».

**نکتهٔ مهم دربارهٔ ماندگاری:** این افزونه در volume به نام `matomodata` نصب
شده و در `config.ini.php` هم به‌عنوان فعال ثبت شده، پس با restart کانتینر از
بین نمی‌رود. اما **در گیت نیست** — اگر روزی volume پاک شود یا Matomo روی
سروری تازه بالا بیاید، باید دوباره نصب شود:

```
docker exec ahantime-matomo-1 sh -c "cd /var/www/html && php console plugin:install MarketingCampaignsReporting"
docker exec ahantime-matomo-1 sh -c "cd /var/www/html && php console plugin:activate MarketingCampaignsReporting"
```

**رابطهٔ آن با پنل خودمان:** این افزونه سمت *ترافیک* را می‌بیند (چه کسی از
کدام کمپین وارد سایت شد). سمت *درآمد* — اینکه آن بازدید در نهایت به معاملهٔ
چند تومانی رسید — در جدول «کمپین‌های تبلیغاتی» صفحهٔ `/admin/marketing`
است که از ستون‌های `utm_*` جدول `leads` می‌خواند. این دو مکمل‌اند، نه تکراری؛
Matomo نمی‌تواند یک بازدید را به معامله‌ای که هفته‌ها بعد بسته می‌شود وصل کند.
