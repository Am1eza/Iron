# آنالیتیکس آهن‌تایم — راه‌اندازی

همه‌چیز آمادهٔ اتصال است و **تا وقتی شناسه ندهید هیچ کد شخص‌ثالثی بارگذاری نمی‌شود**.
شناسه‌ها در زمان build جاسازی می‌شوند (چون صفحات به‌صورت استاتیک تولید می‌شوند)،
پس بعد از تنظیم هر شناسه در `.env`، یک‌بار `docker compose build web && docker compose up -d web` لازم است.

## ۱) Matomo (آنالیتیکس خودمیزبان — پیشنهاد اصلی، داخل ایران کار می‌کند)
سرویس‌های `matomo` و `matomo-db` بالا آمده‌اند و اسکریپت ردیاب از مسیر هم‌مبدأ
`/mt/` سرو می‌شود (بدون تغییر CSP، بدون فیلترشدن).
- **نصب اولیه**: به `https://ahantime.com:8443` بروید و ویزارد نصب Matomo را کامل کنید
  (اطلاعات دیتابیس از قبل در env ست شده: میزبان `matomo-db`، دیتابیس/کاربر `matomo`).
  در پایان یک **Site ID** (معمولاً ۱) می‌گیرید.
- سپس در `.env`: `MATOMO_SITE_ID=1` را بگذارید و web را rebuild کنید. تمام.

## ۲) Google Search Console (GSC)
- در GSC مالکیت `ahantime.com` را با روش «HTML tag» بگیرید؛ مقدار `content` را کپی کنید.
- در `.env`: `GSC_VERIFICATION=<کد>` و rebuild. تگ meta خودکار در `<head>` می‌آید.
- بعد از تأیید، sitemap در `https://ahantime.com/sitemap.xml` را ثبت کنید.

## ۳) Google Analytics 4 / Google Tag Manager
- GA4: در Google Analytics یک Property بسازید → `G-XXXXXXX`. در `.env`: `GA4_ID=G-XXXXXXX`.
- یا GTM (توصیه اگر چند تگ دارید): `GTM_ID=GTM-XXXXXX` (وقتی GTM باشد، GA4 را داخل GTM بگذارید).
- rebuild لازم است (این‌ها دامنه‌های CSP را هم فعال می‌کنند).
- توجه: در ایران دسترسی به دامنه‌های گوگل ممکن است برای بخشی از کاربران محدود باشد؛
  برای همین Matomo به‌عنوان آنالیتیکس اصلی توصیه می‌شود و GA/GTM مکمل.

## خلاصهٔ متغیرها (`.env`)
```
MATOMO_SITE_ID=        # بعد از نصب ویزارد Matomo روی :8443
GSC_VERIFICATION=      # کد HTML-tag از Search Console
GA4_ID=                # G-XXXXXXX
GTM_ID=                # GTM-XXXXXX (اختیاری، جای GA4)
```
