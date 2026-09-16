# آدیت سخت‌گیرانه K — دیتابیس، migration و یکپارچگی

تاریخ: ۲۰۲۶-۰۹-۱۵ · commit: `5f2e4133d6665a15fb9264cbcf874084417ae12a`

## حکم اجرایی: 52/100

این نمره «آمادگی اثبات‌شده» است، نه درصد خرابی سیستم. میانگین ساده ۳۰ نمره زیر است؛ نمره‌های پایین ناشی از ریسک یا شکاف شواهد، به معنی وقوع خسارت نیستند. عبور از میانگین جای بستن موارد P0 را نمی‌گیرد. بخش داده در مسیرهای مالی نسبتاً جدی ساخته شده، اما تضمین‌های استقرار، بازیابی و seed هنوز به اندازه ریسک تجاری قابل اتکا نیستند.

**۵ مورد Critical / P0:** 250، 251، 271، 272، 274؛ چند مورد به یک حادثه مشترک منتهی می‌شوند و نباید خسارتشان با هم جمع شود.

### دامنه و صداقت شواهد

- درخواست ۵۰ migration ذکر کرده بود؛ repository فعلی **۶۷ migration، ۵۸ جدول و ۶۵ FK** دارد و همگی در اسکن وارد شدند.
- دیتابیس واقعی **محلی localhost PostgreSQL 15.14** با transaction فقط‌خواندنی بررسی شد. production در Compose روی PG16 تعریف شده؛ به production/CI اجراشده/مخزن restic متصل نشدیم. موفقیت production ادعا نمی‌شود.
- تمام ۶۷ migration روی PGlite خالی اجرا شد و تکرار اجرا journal را ۶۷ نگه داشت. وجود ستون و nullable نسبت به schema Drizzle و وجود/نوع/nullable تمام ۵۴۶ ستون محلی نسبت به خروجی migration یکسان بود؛ hash تمام ۶۷ migration محلی مطابق بود. این بررسی جای diff کامل default، expression، constraint semantics، collation، role و extension را نمی‌گیرد.
- **۷۰ تست در ۸ فایل موفق**: cascade ۸، seed ۲، عملیات ۱۵، auth ۵، search ۲، risky delete ۱۱، catalog delete ۶، pricing admin grid ۲۱. این‌ها روی PGlite هستند، حتی اگر نام فایل `.pg.test.ts` باشد؛ اثبات concurrency چند اتصال یا PG16 نیستند.
- آزمایش منفی isolated: دو alert فعال با هدف SKU تهی، op نامعتبر و threshold منفی پذیرفته شدند؛ transaction آزمایش rollback شد. این اثبات ضعف DB است، نه اثبات دور زدن API عمومی.
- دو plan محلی صرفاً fragment نماینده هستند؛ profiling کامل query واقعی اپ روی production انجام نشده است. هیچ استنتاجی درباره latency واقعی سایت از داده کوچک محلی نشده است.
- سایت عمومی از نظر ظاهر یا checkout مرور نشد؛ «شواهد سایت» این گزارش کد backend همین سایت، schema و دیتابیس محلی آن است. موارد runtime production صریحاً باز مانده‌اند. آدیت read-only بوده؛ اصلاح production، migration، deploy یا اجرای seed روی دیتابیس واقعی انجام نشد.

### معنی شدت، احتمال، هزینه و Impact

Critical یعنی مسیر قابل‌تصور با اثر توقف کل فروش، داده تجاری غیرقابل‌بازیابی یا قیمت ساختگی؛ High ریسک مهم فروش/اعتماد/مقیاس؛ Medium شکاف محدودتر. احتمال‌ها قضاوت کیفی مشروط به trigger هستند؛ داده آماری رخداد نداریم. P0 پیش از release بعدی مرتبط یا توسعه فروش، P1 در sprint بعد، P2 پس از آن. هزینه‌ها نفرروز مهندس باتجربه، شامل بررسی و تست‌اند؛ هم‌پوشانی دارند و جمع ساده نیستند.

**مبلغ مالی یا درصد افزایش Conversion قابل اثبات نداریم.** برای برآورد واقعی: وقفه = ساعت اختلال × lead واجدشرایط ساعتی × نرخ برد × سود مشارکت هر سفارش؛ خطای قیمت = تعداد سفارش متأثر × اختلاف مبلغ × احتمال پذیرش؛ فقدان داده = معاملات غیرقابل‌بازیابی + نفرساعت بازسازی + فروش از‌دست‌رفته. SEO فقط در خطای crawl/حذف URL/تغییر محتوا اثر دارد؛ برای pool و transaction اثر مستقیم SEO ادعا نمی‌شود. Impact هر بند زیر «ریسک قابل کاهش» است، نه uplift تضمینی.

## جدول نمره‌ها

| بند | موضوع | نمره /۱۰۰ | Severity | اولویت |
|---|---|---:|---|---|
| 246 | تطابق schema، migration و دیتابیس | 72 | High | P1 |
| 247 | drift توسعه، CI و production | 40 | High | P1 |
| 248 | ترتیب و journal | 80 | Medium | P1 |
| 249 | idempotency هنگام restart | 65 | High | P1 |
| 250 | شکست نیمه‌کاره migration و deploy | 45 | Critical | P0 |
| 251 | سازگاری نسخه قبلی و جدید | 35 | Critical | P0 |
| 252 | migrationهای lockکننده | 35 | High | P1 |
| 253 | پوشش indexهای FK | 50 | High | P1 |
| 254 | index تکراری یا بلااستفاده | 65 | Medium | P2 |
| 255 | query plan جستجو و پنل | 45 | High | P1 |
| 256 | N+1 قیمت، سفارش، CRM و AI | 65 | Medium | P2 |
| 257 | ON DELETE و ON UPDATE | 75 | Medium | P2 |
| 258 | cascade مخرب category/user/SKU | 60 | High | P1 |
| 259 | nullable مطابق دامنه | 40 | High | P1 |
| 260 | check status، مبلغ، وزن، count | 45 | High | P1 |
| 261 | uniqueness favorites/votes/alerts/idempotency | 65 | High | P1 |
| 262 | duplicate در concurrency | 70 | High | P1 |
| 263 | transaction چندجدولی | 78 | Medium | P1 |
| 264 | isolation قیمت، inventory و rotation | 78 | High | P1 |
| 265 | lost update در پنل | 45 | High | P1 |
| 266 | بودجه کل pool | 75 | Medium | P2 |
| 267 | pool در کندی/restart PostgreSQL | 40 | High | P1 |
| 268 | statement/query/lock timeout | 25 | High | P1 |
| 269 | رشد audit/price/AI/SMS | 50 | High | P1 |
| 270 | archive و retention | 45 | High | P1 |
| 271 | backup تمام PostgreSQL/MariaDB | 25 | Critical | P0 |
| 272 | restore واقعی | 35 | Critical | P0 |
| 273 | رمزنگاری و کلید restic | 55 | High | P1 |
| 274 | جلوگیری از seed ناخواسته production | 20 | Critical | P0 |
| 275 | idempotency seed و حفظ داده واقعی | 40 | High | P1 |

## K-246 — تطابق schema، migration و دیتابیس · 72/100

- **وضعیت فعلی و مشکل دقیق:** ۶۷ فایل SQL و ۵۸ جدول بررسی شد؛ تطابق وجود ستون، nullable و نوع SQL بین خروجی migration و دیتابیس محلی برقرار است. تطابق معنایی کامل defaults، constraintها و production هنوز اثبات نشده.
- **شدت مشکل:** High · **احتمال وقوع:** نامعلوم در production.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** drift می‌تواند ثبت سفارش را با خطای SQL قطع کند؛ Revenue و Conversion مستقیم، UX خطا؛ SEO در صورت 5xx گسترده.
- **شواهد از پیاده‌سازی سایت:** web/drizzle/meta/_journal.json؛ docs/audit-k-evidence/local-comparison.json؛ web/scripts/auditDatabaseK.mts
- **راه‌حل پیشنهادی:** schema fingerprint برای هر محیط شامل type/default/FK/check/index/extension و نسخه engine؛ مقایسه با clean migration در CI.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۵ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [Stripe: Online migrations](https://stripe.com/blog/online-migrations) — الگوی مهاجرت مرحله‌ای؛ کاربرد در این بند پیشنهاد معماری است، نه ادعای استفاده Stripe از Drizzle.
- **Acceptance Criteria:** صفر اختلاف توضیح‌نداده در هر سه محیط، شامل تمام ۶۷ hash؛ artifact مقایسه به SHA release متصل باشد.

## K-247 — drift توسعه، CI و production · 40/100

- **وضعیت فعلی و مشکل دقیق:** localhost واقعاً PostgreSQL 15.14 است؛ Compose نسخه 16-alpine دارد؛ CI فاقد سرویس مستقل PG16 و تست‌ها متکی به PGlite هستند. این اختلاف engine است، نه اثبات خرابی schema production.
- **شدت مشکل:** High · **احتمال وقوع:** اختلاف نسخه قطعی؛ اثر نامعلوم.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** خطای فقط-production هزینه deploy و وقفه فروش ایجاد می‌کند؛ SEO غیرمستقیم از ناپایداری.
- **شواهد از پیاده‌سازی سایت:** docs/audit-k-evidence/local-database.json؛ docker-compose.yml:197؛ .github/workflows/ci.yml؛ web/src/test/db.ts:17
- **راه‌حل پیشنهادی:** CI integration روی PG16 با extension و تنظیمات یکسان؛ drift gate پیش از deploy.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [Stripe: Online migrations](https://stripe.com/blog/online-migrations) — الگوی مهاجرت مرحله‌ای؛ کاربرد در این بند پیشنهاد معماری است، نه ادعای استفاده Stripe از Drizzle.
- **Acceptance Criteria:** migration و تست چنداتصالی روی نسخه واقعی هدف اجرا شوند؛ اختلاف پیکربندی مستند و قابل بررسی باشد.

## K-248 — ترتیب و journal · 80/100

- **وضعیت فعلی و مشکل دقیق:** ۶۷ idx پیوسته، timestamp صعودی، بدون SQL جاافتاده؛ هر ۶۷ hash دیتابیس محلی مطابق فایل است. runner در زمان اجرا فقط آخرین created_at را ملاک می‌گیرد و hash گذشته را اعتبارسنجی نمی‌کند.
- **شدت مشکل:** Medium · **احتمال وقوع:** متوسط در تغییر دستی تاریخچه.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** تغییر migration اعمال‌شده می‌تواند محیط‌ها را بی‌صدا متفاوت کند؛ هزینه عیب‌یابی و توقف فروش.
- **شواهد از پیاده‌سازی سایت:** docs/audit-k-evidence/journal.json؛ local-comparison.json؛ web/node_modules/drizzle-orm/pg-core/dialect.js:54
- **راه‌حل پیشنهادی:** immutability فایل اعمال‌شده و بررسی تمام hashها قبل از migration؛ gate تغییر journal.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۱–۲ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ متوسط، کاهش هزینه و افزایش قابلیت اثبات. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [Stripe: Online migrations](https://stripe.com/blog/online-migrations) — الگوی مهاجرت مرحله‌ای؛ کاربرد در این بند پیشنهاد معماری است، نه ادعای استفاده Stripe از Drizzle.
- **Acceptance Criteria:** ویرایش یک SQL قدیمی یا حذف entry باید قبل از اجرای هر DDL با پیام دقیق شکست بخورد.

## K-249 — idempotency هنگام restart · 65/100

- **وضعیت فعلی و مشکل دقیق:** دو اجرای متوالی در PGlite journal را ۶۷ نگه داشت. migrate.mjs قفل سراسری ندارد و migrator آخرین migration را پیش از transaction می‌خواند؛ اجرای هم‌زمان دو container ایمن اثبات نشده است.
- **شدت مشکل:** High · **احتمال وقوع:** کم تک‌نمونه؛ متوسط چندنمونه.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** restart هم‌زمان می‌تواند یک نمونه را در حلقه شکست startup بیندازد؛ Revenue/UX وابسته به ظرفیت باقی‌مانده.
- **شواهد از پیاده‌سازی سایت:** web/scripts/migrate.mjs:19؛ web/docker-entrypoint.sh:11؛ docs/audit-k-evidence/offline-schema.json
- **راه‌حل پیشنهادی:** migration به job واحد منتقل شود یا advisory lock روی همان اتصال اجرایی گرفته شود.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۱–۳ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [Stripe: Online migrations](https://stripe.com/blog/online-migrations) — الگوی مهاجرت مرحله‌ای؛ کاربرد در این بند پیشنهاد معماری است، نه ادعای استفاده Stripe از Drizzle.
- **Acceptance Criteria:** دو runner واقعی موازی و ۱۰ restart متوالی: هر migration دقیقاً یک بار، journal بدون duplicate و هر دو startup موفق.

## K-250 — شکست نیمه‌کاره migration و deploy · 45/100

- **وضعیت فعلی و مشکل دقیق:** Drizzle SQLهای pending را در transaction می‌گذارد و entrypoint با set -e متوقف می‌شود؛ اما deploy با شکست backup ادامه می‌دهد و بعد از health failure فقط image قبلی را بالا می‌آورد. اگر migration commit شود و اپ خراب باشد، schema جدید باقی می‌ماند.
- **شدت مشکل:** Critical · **احتمال وقوع:** متوسط هنگام migration ناسازگار.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** توقف کامل فروش در rollout؛ احتمال از دست رفتن تغییرات پس از backup در بازیابی اضطراری؛ Critical به دلیل دامنه سایت.
- **شواهد از پیاده‌سازی سایت:** .github/workflows/deploy.yml:559–583 و 619–640؛ web/scripts/migrate.mjs؛ dialect.js:60
- **راه‌حل پیشنهادی:** backup gate سخت، preflight، migration job و سناریوی rollback سازگار؛ runbook recovery با مرز از دست رفتن داده.
- **اولویت اجرا:** P0 · **سختی/هزینه اجرا:** ۳–۵ روز؛ زیاد.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بسیار بالا، حفاظت از تداوم فروش/داده. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [Stripe: Online migrations](https://stripe.com/blog/online-migrations) — الگوی مهاجرت مرحله‌ای؛ کاربرد در این بند پیشنهاد معماری است، نه ادعای استفاده Stripe از Drizzle.
- **Acceptance Criteria:** fault injection قبل/وسط DDL، بعد commit و قبل health: نتیجه schema و app معلوم؛ شکست backup rollout را متوقف کند؛ smoke سفارش پس از recovery موفق.

## K-251 — سازگاری نسخه قبلی و جدید · 35/100

- **وضعیت فعلی و مشکل دقیق:** migration 0049 ستون is_active را حذف می‌کند؛ نمونه روشنی از تغییر contractشکن تاریخی است، نه اثبات ناسازگاری آخرین دو release. هیچ آزمون N−1 روی schema جدید در workflow دیده نشد؛ SELECT 1 سلامت queryهای اپ را تضمین نمی‌کند.
- **شدت مشکل:** Critical · **احتمال وقوع:** متوسط در rollback مخرب.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** rollback ظاهراً سبز اما صفحات/سفارش خطادار؛ Revenue و Conversion مستقیم، SEO مشروط به تداوم خطا.
- **شواهد از پیاده‌سازی سایت:** web/drizzle/0049_drop_catalog_is_active.sql:27؛ .github/workflows/deploy.yml:619؛ web/src/app/api/health/route.ts:36
- **راه‌حل پیشنهادی:** expand/contract چندمرحله‌ای، نگه‌داشت ستون قدیمی تا پایان پنجره rollback، smoke نسخه قبلی با schema جدید.
- **اولویت اجرا:** P0 · **سختی/هزینه اجرا:** ۴–۷ روز؛ زیاد.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بسیار بالا، حفاظت از تداوم فروش/داده. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [Stripe: Online migrations](https://stripe.com/blog/online-migrations) — الگوی مهاجرت مرحله‌ای؛ کاربرد در این بند پیشنهاد معماری است، نه ادعای استفاده Stripe از Drizzle.
- **Acceptance Criteria:** N و N−1 بتوانند login/search/ثبت lead/سفارش را روی schema جدید انجام دهند؛ حذف ستون فقط بعد از پایان پشتیبانی نسخه قدیم.

## K-252 — migrationهای lockکننده · 35/100

- **وضعیت فعلی و مشکل دقیق:** CREATE INDEX عادی در 0064 روی otp_codes/refresh_tokens و ALTERها بدون lock_timeout اجرا می‌شوند؛ transaction کل migration با CREATE INDEX CONCURRENTLY سازگار نیست. مدت lock واقعی production اندازه‌گیری نشده.
- **شدت مشکل:** High · **احتمال وقوع:** با رشد جدول بالا.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** معطلی login و سفارش هنگام deploy؛ کاهش Conversion و اعتماد؛ خطر رشد.
- **شواهد از پیاده‌سازی سایت:** web/drizzle/0064_safe_prism.sql؛ web/scripts/migrate.mjs:19؛ dialect.js:60
- **راه‌حل پیشنهادی:** مسیر nontransactional مخصوص concurrent index، lock timeout کوتاه، backfill تکه‌ای و validate جداگانه.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۶ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** روی داده هم‌اندازه production و بار هم‌زمان، migration بدون توقف محسوس write؛ بودجه پیشنهادی lock زیر ۱ ثانیه و fail-fast قابل retry.

## K-253 — پوشش indexهای FK · 50/100

- **وضعیت فعلی و مشکل دقیق:** اسکن ۶۵ FK، ۱۱ candidate فاقد index کامل غیرpartial داد. یک مورد composite SKU با prefix sub_category_id پوشش مفید جزئی دارد؛ آن را بی-index نمی‌نامیم. ۹ FK تک‌ستونی فاقد پوشش کامل و orders.lead_id فقط partial دارد.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط، بیشتر با رشد.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** حذف/اصلاح مرجع می‌تواند جدول مالی یا تاریخچه قیمت را scan کند و write را معطل کند؛ Revenue/UX و مقیاس.
- **شواهد از پیاده‌سازی سایت:** docs/audit-k-evidence/offline-schema.json؛ schema/operations.ts؛ schema/pricing.ts؛ schema/orders.ts
- **راه‌حل پیشنهادی:** indexهای ضروری با توجه به بار، اندازه و plan؛ index غیرpartial برای orders.lead_id جهت ردیف‌های archive؛ ساخت concurrent.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** هر candidate تصمیم مکتوب و EXPLAIN با حجم واقعی داشته باشد؛ زمان FK parent delete/update در budget بماند.

## K-254 — index تکراری یا بلااستفاده · 65/100

- **وضعیت فعلی و مشکل دقیق:** در تعریف‌های حاصل migration هیچ duplicate دقیق با روش اسکن دیده نشد؛ overlap و unused واقعی با این نتیجه رد نمی‌شوند. آمار workload production و زمان reset stats نداریم.
- **شدت مشکل:** Medium · **احتمال وقوع:** نامعلوم.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** index اضافی write/WAL/storage را گران می‌کند؛ اثر مالی زیرساختی، SEO مستقیم ندارد.
- **شواهد از پیاده‌سازی سایت:** docs/audit-k-evidence/offline-schema.json:duplicateIndexCandidates؛ local-database.json
- **راه‌حل پیشنهادی:** ثبت pg_stat_user_indexes طی دوره نماینده و بررسی overlap همراه constraint ownership.
- **اولویت اجرا:** P2 · **سختی/هزینه اجرا:** ۲–۳ روز + ۳۰ روز مشاهده؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ متوسط، کاهش هزینه و افزایش قابلیت اثبات. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** برای هر حذف پیشنهادی ۳۰ روز نمونه شامل jobs و پایان ماه، plan قبل/بعد و rollback index وجود داشته باشد؛ index یکتا صرفاً به دلیل idx_scan کم حذف نشود.

## K-255 — query plan جستجو و پنل · 45/100

- **وضعیت فعلی و مشکل دقیق:** ranking test فقط صحت دو نتیجه را می‌سنجد. plan محلی برای دو fragment نماینده ذخیره شد؛ این داده کوچک، plan کامل SQL تولیدشده اپ یا production نیست. word_similarity(...)>=0.45 در fallback ریسک محاسبه روی تعداد زیاد ردیف دارد.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط در کاتالوگ بزرگ.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** جستجوی کند مستقیماً Conversion را کم می‌کند؛ پنل کند پاسخ فروش را عقب می‌اندازد؛ SEO غیرمستقیم.
- **شواهد از پیاده‌سازی سایت:** web/src/lib/server/repos/catalogRepo.ts:850–957؛ catalogRepo.search.pg.test.ts؛ docs/audit-k-evidence/local-plans.json
- **راه‌حل پیشنهادی:** ثبت SQL واقعی و EXPLAIN ANALYZE BUFFERS برای exact/fuzzy/فیلترهای پنل؛ index/operator مناسب با حفظ ranking.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۵ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** روی داده نماینده و cache سرد/گرم، p95 پیشنهادی DB جستجو زیر ۱۵۰ms و پنل زیر ۲۰۰ms؛ نتایج ranking قبلی حفظ شوند.

## K-256 — N+1 قیمت، سفارش، CRM و AI · 65/100

- **وضعیت فعلی و مشکل دقیق:** orders و lead items خواندن batch دارند؛ N+1 سراسری اثبات نشد. unmatchedQueryTokens به ازای هر token یک query با Promise.all می‌سازد؛ AI در بازیابی query ناموفق از این مسیر هزینه اضافه می‌گیرد.
- **شدت مشکل:** Medium · **احتمال وقوع:** fan-out قطعی در مسیر token.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** مصرف pool و تأخیر پاسخ AI، هزینه پردازش و رها کردن مشاوره؛ SEO مستقیم ندارد.
- **شواهد از پیاده‌سازی سایت:** web/src/lib/server/repos/ordersRepo.ts:104؛ leadsRepo.ts:104 و 499؛ catalogRepo.ts:816–836
- **راه‌حل پیشنهادی:** batch token matching در یک query؛ محدودیت token و instrumentation تعداد query در تمام چهار مسیر.
- **اولویت اجرا:** P2 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ متوسط، کاهش هزینه و افزایش قابلیت اثبات. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** با ۱۰ و ۱۰۰ ردیف تعداد query تابع تعداد ردیف نباشد؛ token recovery یک query batch با نتایج یکسان بدهد.

## K-257 — ON DELETE و ON UPDATE · 75/100

- **وضعیت فعلی و مشکل دقیق:** تمام ۶۵ FK در evidence فهرست شدند؛ رفتار cascade/set null/restrict چند رابطه تست شده است. بیشتر ON UPDATEها NO ACTION است؛ این با ID ثابت الزاماً ایراد نیست. پوشش آزمایشی کامل تمام رابطه‌ها وجود ندارد.
- **شدت مشکل:** Medium · **احتمال وقوع:** کم تا متوسط.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** حذف مسدود یا orphan منطقی ممکن است فرایند فروش را مختل کند؛ خطای تاریخی پرهزینه است.
- **شواهد از پیاده‌سازی سایت:** docs/audit-k-evidence/offline-schema.json:foreignKeys؛ schemaCascade.test.ts؛ schema/catalog.ts
- **راه‌حل پیشنهادی:** ماتریس دامنه برای همه FKها و تست parent delete/update؛ تفکیک NO ACTION از RESTRICT در مستندات.
- **اولویت اجرا:** P2 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ متوسط، کاهش هزینه و افزایش قابلیت اثبات. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** ۶۵ رابطه دارای تصمیم دامنه؛ حذف/تغییر parent و تراکنش rollback مطابق آن؛ هیچ سند مالی ناخواسته حذف نشود.

## K-258 — cascade مخرب category/user/SKU · 60/100

- **وضعیت فعلی و مشکل دقیق:** حذف category در تست عمداً SKU، current_prices و price_points را حذف می‌کند؛ حفظ سوابق lead/order بهتر است و risky-delete tests موفق شدند. پس حفاظت اپ وجود دارد اما DB هنوز حذف تاریخچه قیمت را مجاز می‌داند.
- **شدت مشکل:** High · **احتمال وقوع:** کم در API محافظت‌شده؛ بالا در SQL مستقیم.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** از دست رفتن سابقه قیمت، کاتالوگ و URLهای محصول؛ Revenue/SEO/اعتماد در حذف اشتباه.
- **شواهد از پیاده‌سازی سایت:** web/src/lib/server/db/schemaCascade.test.ts:51–65؛ catalogRiskyDelete.pg.test.ts؛ schema/pricing.ts
- **راه‌حل پیشنهادی:** تصمیم نگه‌داری تاریخچه، restrict/soft delete و نقش DB محدود برای delete؛ مسیر purge مستقل و قابل بازیابی.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** DELETE مستقیم دسته دارای تاریخچه بدون مجوز purge رد شود یا تاریخچه مستقل بماند؛ API محافظت‌شده و restore محصول تست شود.

## K-259 — nullable مطابق دامنه · 40/100

- **وضعیت فعلی و مشکل دقیق:** alerts با target_type=sku و sku_id=NULL پذیرفته می‌شود؛ XOR هدف SKU/market در DB نیست. nullable بودن ارجاع سفارش تاریخی به‌خودی‌خود ایراد نیست.
- **شدت مشکل:** High · **احتمال وقوع:** ورودی معیوب قطعی در DB؛ مسیر عمومی اثبات نشده.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** هشدار ظاهراً ساخته می‌شود اما هدفی ندارد؛ UX و اعتماد و Conversion بازگشتی آسیب می‌بیند.
- **شواهد از پیاده‌سازی سایت:** schema/engagement.ts:46–59؛ docs/audit-k-evidence/offline-schema.json:invalidAlertAccepted
- **راه‌حل پیشنهادی:** CHECK هدف: دقیقاً یکی از sku_id/market_key با target_type منطبق؛ audit و اصلاح ردیف‌های قبلی.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۳ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** SQL مستقیم چهار حالت ناسازگار را رد کند؛ SKU و market معتبر پذیرفته شوند؛ صفر alert بدون هدف.

## K-260 — check status، مبلغ، وزن، count · 45/100

- **وضعیت فعلی و مشکل دقیق:** ۳۱ CHECK وجود دارد و قیمت/انبار محافظت‌هایی دارند؛ اما enum TypeScript برای text الزام DB نیست. در آزمایش isolated دو alert با op=nonsense و threshold=-1 پذیرفته شدند. پوشش weightKg در order_items هم با CHECK مالی یکی نیست.
- **شدت مشکل:** High · **احتمال وقوع:** پذیرش داده نامعتبر در DB قطعی.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** داده نامعتبر می‌تواند محاسبه، هشدار و گزارش را خراب کند؛ مبلغ مالی در مسیرهای بی‌قید ریسک تسویه دارد.
- **شواهد از پیاده‌سازی سایت:** docs/audit-k-evidence/offline-schema.json:checks و invalidAlertAccepted؛ schema/orders.ts:100–120؛ engagement.ts
- **راه‌حل پیشنهادی:** ماتریس constraint برای status/unit/count/finite weight/محدوده پول؛ پاک‌سازی پیش از VALIDATE.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۵ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** SQL مستقیم مقدار منفی/NaN/Infinity/وضعیت ناشناخته را برای ستون مرتبط رد کند؛ مرزهای معتبر قبول شوند.

## K-261 — uniqueness favorites/votes/alerts/idempotency · 65/100

- **وضعیت فعلی و مشکل دقیق:** favorites و votes unique و alerts دو partial unique دارند؛ اما NULL هدف اجازه دو alert فعال یکسانِ بی‌هدف می‌دهد، در آزمایش بازتولید شد. unique موجود به تنهایی دامنه را کامل نمی‌بندد.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط در مسیر نوشتن دیگر.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** هشدار تکراری یا بی‌مصرف، تماس/SMS اضافی و از دست رفتن اعتماد؛ هزینه مستقیم notification.
- **شواهد از پیاده‌سازی سایت:** schema/engagement.ts:36 و 101؛ schema/content.ts:185؛ offline-schema.json:invalidAlertAccepted
- **راه‌حل پیشنهادی:** ابتدا CHECK هدف؛ تعیین سیاست dedup برای soft-delete و channel؛ تست SQL و concurrency با constraint واقعی.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۳ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** ۲۰ درخواست هم‌زمان برای هر favorite/vote/alert منطقی فقط یک ردیف معتبر بسازند؛ ردیف ناقص رد شود؛ رفتار soft-delete مشخص.

## K-262 — duplicate در concurrency · 70/100

- **وضعیت فعلی و مشکل دقیق:** businessOperation و uniqueها و advisory lock قیمت وجود دارند؛ تست‌های ۷۰تایی مفیدند ولی PGlite الگوی contention چنداتصالی production را اثبات نمی‌کند؛ seed نیز check-count-then-insert دارد.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط، هنوز چنداتصالی اندازه‌گیری نشده.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** تکرار سفارش/صورتحساب/ارسال، هزینه و مغایرت مالی؛ پیامد شدید ولی رخداد production مشاهده نشد.
- **شواهد از پیاده‌سازی سایت:** utils/businessOperation.ts؛ services/pricing.service.ts:99–136؛ services/operations.pg.test.ts؛ db/seed.ts:174 و 302
- **راه‌حل پیشنهادی:** تست چند client واقعی برای claim/اولین قیمت/ثبت lead-order/seed؛ retry فقط برای خطاهای قابل retry و با idempotency.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۵ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** ۵۰ writer واقعی، یک نتیجه منطقی و صفر اثر جانبی تکراری؛ 23505/40001/40P01 مدیریت‌شده.

## K-263 — transaction چندجدولی · 78/100

- **وضعیت فعلی و مشکل دقیق:** قیمت، lead+items و عملیات انبار transaction و تست rollback دارند؛ seed سراسری transaction ندارد و crash می‌تواند bootstrap نیمه‌کاره بگذارد. وجود transaction در چند service تضمین تمام write pathها نیست.
- **شدت مشکل:** Medium · **احتمال وقوع:** کم در مسیرهای بررسی‌شده.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** حالت نیمه‌کاره قیمت/سفارش به مغایرت و تماس پشتیبانی می‌انجامد؛ کاتالوگ ناقص فروش را محدود می‌کند.
- **شواهد از پیاده‌سازی سایت:** services/pricing.service.ts:99–250؛ repos/leadsRepo.ts:45–88؛ services/operations.pg.test.ts؛ db/seed.ts:41
- **راه‌حل پیشنهادی:** فهرست واحدهای کاری و failure injection؛ bootstrap بخش‌بندی اتمیک؛ اثر خارجی بعد commit با outbox.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ متوسط، کاهش هزینه و افزایش قابلیت اثبات. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** قطع اجرا بعد هر write چندجدولی یا همه invariantها را commit کند یا هیچ‌کدام؛ outbox دوباره‌اجرا اثر مضاعف ندهد.

## K-264 — isolation قیمت، inventory و rotation · 78/100

- **وضعیت فعلی و مشکل دقیق:** قیمت advisory lock و row lock، rotation قفل user سپس token دارد؛ انبار version و lock دارد. READ COMMITTED با این قفل‌ها لزوماً اشتباه نیست؛ آزمون PG چنداتصالی و deadlock recovery هنوز نداریم.
- **شدت مشکل:** High · **احتمال وقوع:** نامعلوم تحت contention واقعی.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** موجودی منفی یا نشست نامطمئن روی فروش و اعتماد اثر بالا دارد؛ وقوع آن از بررسی فعلی ثابت نشده.
- **شواهد از پیاده‌سازی سایت:** services/pricing.service.ts:99–110؛ auth/store.pg.ts:247–282؛ repos/ordersRepo.ts؛ operations.pg.test.ts
- **راه‌حل پیشنهادی:** اثبات invariants با دو یا چند اتصال، ترتیب ثابت locks و retry محدود transaction؛ از SERIALIZABLE کورکورانه اجتناب شود.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۵ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** reserve/release/rotate و اولین قیمت هم‌زمان invariantها را نگه دارند؛ تست pause بین read/write و kill اتصال پاس شود.

## K-265 — lost update در پنل · 45/100

- **وضعیت فعلی و مشکل دقیق:** قیمت و انبار version دارند؛ updateLead در حالت عادی WHERE id دارد و expectedVersion ندارد؛ ifAssigneeId فقط یک guard اختیاری برای assignment است. دو ویرایش stale روی status/callback می‌توانند آخرین‌نویسنده‌برنده شوند.
- **شدت مشکل:** High · **احتمال وقوع:** بالا در ویرایش مشترک CRM.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** از دست رفتن پیگیری/assignment فروش، lead فراموش‌شده و Conversion پایین‌تر؛ UX بی‌اعتماد.
- **شواهد از پیاده‌سازی سایت:** web/src/lib/server/repos/leadsRepo.ts:310–330؛ pricing.service.ts:136؛ operations.pg.test.ts:61
- **راه‌حل پیشنهادی:** version اجباری در read/update پنل CRM و UI حل conflict؛ تغییرات disjoint طبق سیاست merge شوند.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** دو اپراتور یک نسخه را بخوانند: تغییر دوم متعارض 409 بدهد و مقدار اول محفوظ بماند؛ UI تغییر جدید را نشان دهد.

## K-266 — بودجه کل pool · 75/100

- **وضعیت فعلی و مشکل دقیق:** پیش‌فرض ۳×۱۰ web +۱۰ jobs =۴۰ اتصال از max_connections=100 است؛ مناسب روی کاغذ. env override و replica بیشتر gate ندارند؛ workers Cloudflare مدل per-request متفاوت دارند.
- **شدت مشکل:** Medium · **احتمال وقوع:** کم در پیش‌فرض؛ متوسط در scale.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** اشباع connection ظرفیت فروش را می‌گیرد؛ افزایش بی‌برنامه worker ضد رشد است.
- **شواهد از پیاده‌سازی سایت:** docker-compose.yml:49–58 و 227؛ db/client.ts:111 و 143–158؛ docker-entrypoint.sh:23
- **راه‌حل پیشنهادی:** بودجه شامل replica، migration، backup، monitor و رزرو عملیات؛ validate env و alert wait queue.
- **اولویت اجرا:** P2 · **سختی/هزینه اجرا:** ۱–۳ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ متوسط، کاهش هزینه و افزایش قابلیت اثبات. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** بدترین overlap rollout کمتر از بودجه تعیین‌شده باشد؛ load test ۲ برابر peak با reserve عملیاتی و queue wait قابل‌قبول.

## K-267 — pool در کندی/restart PostgreSQL · 40/100

- **وضعیت فعلی و مشکل دقیق:** connectionTimeoutMillis=5000 هست؛ handler pool.on(error) در client دیده نشد؛ jobs به‌صورت background بدون supervisor است و اگر بمیرد تا restart برنمی‌گردد. تست restart واقعی اجرا نشده.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** مرگ jobs می‌تواند SMS و cleanup را خاموش کند؛ crash worker یا صف اتصال روی UX و فروش اثر مستقیم دارد.
- **شواهد از پیاده‌سازی سایت:** db/client.ts:111 و 158؛ web/docker-entrypoint.sh:15–23
- **راه‌حل پیشنهادی:** مدیریت idle-client error، shutdown و reconnect، نظارت مستقل jobs و metric آخرین اجرای موفق.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** restart PG زیر بار: بدون rejection مدیریت‌نشده؛ بازیابی خودکار web و jobs در SLO پیشنهادی ۶۰ ثانیه، بدون عملیات مالی تکراری.

## K-268 — statement/query/lock timeout · 25/100

- **وضعیت فعلی و مشکل دقیق:** در کلاینت فقط timeout اتصال تنظیم است؛ دیتابیس محلی واقعاً statement_timeout، lock_timeout و idle_in_transaction_session_timeout صفر دارد. تنظیم واقعی production نامعلوم است.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط تا بالا با query کند.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** یک query/lock طولانی اتصال را نگه می‌دارد و صف فروش می‌سازد؛ health SELECT 1 هم می‌تواند پشت صف بماند.
- **شواهد از پیاده‌سازی سایت:** db/client.ts:111 و 158؛ docs/audit-k-evidence/local-database.json:settings؛ migrate.mjs:19
- **راه‌حل پیشنهادی:** بودجه جدا برای OLTP، job، migration؛ statement timeout سمت DB، request deadline و cancel واقعی query.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۱–۳ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** SELECT pg_sleep و lock عمدی در محیط آزمایش در budget قطع شوند؛ اتصال سالم به pool بازگردد؛ query پس از قطع HTTP ادامه نداشته باشد.

## K-269 — رشد audit/price/AI/SMS · 50/100

- **وضعیت فعلی و مشکل دقیق:** retention برای SMS ۹۰، AI usage ۱۸۰ و audit ۳۶۵ روز هست؛ price_points عمداً دائمی است؛ business_operations/outbox نیز سیاست پاک‌سازی روشن در cleanup ندارند. نبود retention قیمت الزاماً غلط نیست، نبود ظرفیت/partition مسئله است.
- **شدت مشکل:** High · **احتمال وقوع:** بالا با ادامه رشد.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** پرشدن دیسک و vacuum عقب‌افتاده می‌تواند تمام writeهای فروش را متوقف کند؛ هزینه زیرساخت و UX.
- **شواهد از پیاده‌سازی سایت:** jobs/cleanup.job.ts:240–268؛ schema/operations.ts؛ local-database.json:stats
- **راه‌حل پیشنهادی:** اندازه‌گیری رشد، forecast، partition/rollup متناسب با نیاز تاریخی و alert فضای آزاد؛ cleanup health.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۵ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** رشد ماهانه و تاریخ اشباع محاسبه شود؛ load داده ۱۲ ماهه و restore آن در بودجه؛ هشدار پیش از کمتر از ۳۰٪ فضای آزاد.

## K-270 — archive و retention · 45/100

- **وضعیت فعلی و مشکل دقیق:** cleanup حذف یکجای DELETE برای جدول‌های بزرگ دارد؛ archive قبل حذف audit/AI دیده نشد. market_points الگوریتم جدا دارد؛ نمی‌توان مشکل DELETE را به آن تعمیم داد.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** دوره حذف سنگین write را کند می‌کند؛ حذف شواهد موردنیاز اختلاف مشتری هزینه بازیابی و اعتماد دارد.
- **شواهد از پیاده‌سازی سایت:** jobs/cleanup.job.ts:240–268 و 20–45؛ docs/BACKUP.md
- **راه‌حل پیشنهادی:** policy موردتوافق کسب‌وکار؛ batch محدود یا partition drop، archive قابل query و checksum؛ مانیتور vacuum/WAL.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۳–۶ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: index migration](https://docs.gitlab.com/development/database/adding_database_indexes/) — نمونه مستند مدیریت تغییر index در مقیاس؛ target latency این گزارش پیشنهاد ماست.
- **Acceptance Criteria:** cleanup در dataset ۱۰ برابر فعلی latency فروش را از SLO خارج نکند؛ نمونه archive بازیابی‌پذیر و legal/business hold قابل استثنا باشد.

## K-271 — backup تمام PostgreSQL/MariaDB · 25/100

- **وضعیت فعلی و مشکل دقیق:** اسکریپت repo فقط db/ahantime را dump می‌کند؛ Compose دارای glitchtip-db و MariaDB است. docs/BACKUP می‌گوید هر دو نسخه روی همان host هستند؛ این وضعیت زنده دوباره تأیید نشده. نبود config restic با exit 0 تمام می‌شود.
- **شدت مشکل:** Critical · **احتمال وقوع:** متوسط؛ دامنه فقدان بالقوه کامل.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** در نابودی host امکان از دست دادن سفارش، lead، analytics و شواهد رخداد؛ Critical به دلیل خسارت بالقوه غیرقابل‌بازگشت.
- **شواهد از پیاده‌سازی سایت:** ops/ahantime-db-backup.sh:14 و 45–55؛ docker-compose.yml:273 و 357؛ docs/BACKUP.md:16
- **راه‌حل پیشنهادی:** inventory همه DBها/roles/configs، backup مستقل هر engine، مقصد خارج host و alert freshness واقعی؛ نبود offsite باید fail شود.
- **اولویت اجرا:** P0 · **سختی/هزینه اجرا:** ۲–۵ روز؛ زیاد.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بسیار بالا، حفاظت از تداوم فروش/داده. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: postmortem بازیابی](https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/) — نمونه واقعی شکست و درس بازیابی؛ شهرت سایت تضمین سلامت backup نیست.
- **Acceptance Criteria:** هر DB snapshot مستقل و قابل restore داشته باشد؛ نابودی فرضی host بدون اتکا به دیسک قبلی بازیابی شود؛ RPO هدف مصوب و قابل اندازه‌گیری.

## K-272 — restore واقعی · 35/100

- **وضعیت فعلی و مشکل دقیق:** مستندات ادعای restore تاریخی ۱۴۰۵/۰۵/۰۹ برای چند جدول دارند؛ مدرک اجرای جدید همه DBها نداریم. فرمان psql نمونه بدون ON_ERROR_STOP است و count یک جدول صحت کل بازیابی نیست.
- **شدت مشکل:** Critical · **احتمال وقوع:** قابلیت فعلی نامعلوم.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** backup سبز ولی restore ناقص در حادثه یعنی وقفه طولانی فروش و احتمال از دست دادن داده؛ Critical ناشی از وابستگی recovery.
- **شواهد از پیاده‌سازی سایت:** docs/BACKUP.md:58 به بعد؛ ops/ahantime-db-backup.sh
- **راه‌حل پیشنهادی:** restore زمان‌بندی‌شده در مقصد جدا، psql ON_ERROR_STOP، همه engineها، invariant و smoke کسب‌وکار و RTO ثبت‌شده.
- **اولویت اجرا:** P0 · **سختی/هزینه اجرا:** ۳–۵ روز؛ زیاد.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بسیار بالا، حفاظت از تداوم فروش/داده. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [GitLab: postmortem بازیابی](https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/) — نمونه واقعی شکست و درس بازیابی؛ شهرت سایت تضمین سلامت backup نیست.
- **Acceptance Criteria:** backup جدید خارج host روی محیط خالی restore شود؛ FKها، مبلغ/تعداد سفارش و فایل‌ها تأیید؛ login/search/سفارش smoke؛ RTO پیشنهادی زیر ۴ ساعت.

## K-273 — رمزنگاری و کلید restic · 55/100

- **وضعیت فعلی و مشکل دقیق:** restic رمزگذاری می‌کند و umask077 برای dump محلی هست؛ gzip محلی رمزگذاری نیست. docs نگه‌داری رمز خارج host را توصیه می‌کند، اما escrow/rotation drill اثبات نشده.
- **شدت مشکل:** High · **احتمال وقوع:** نامعلوم در مدیریت کلید واقعی.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** گم‌شدن کلید بازیابی را ناممکن و افشای dump اعتماد مشتری را مخدوش می‌کند؛ Revenue غیرمستقیم.
- **شواهد از پیاده‌سازی سایت:** ops/ahantime-db-backup.sh:8–10 و 45–55؛ docs/BACKUP.md بخش رمز
- **راه‌حل پیشنهادی:** secret manager و نسخه recovery مستقل، کمترین دسترسی backup، test رمز اشتباه و کلید recovery، سیاست encryption محلی.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۱–۲ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [restic: طراحی رمزنگاری](https://github.com/restic/restic/blob/master/doc/design.rst) — مرجع ابزار؛ مثال سازمانی برای ضرورت recovery مستقل، [حادثه GitLab](https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/). شواهدی از استفاده آن شرکت از restic ادعا نمی‌شود.
- **Acceptance Criteria:** اپ به credential مخزن دسترسی نداشته باشد؛ restore با کلید مستقل از host موفق، با رمز غلط fail؛ محل escrow و مسئول آن ثبت شود.

## K-274 — جلوگیری از seed ناخواسته production · 20/100

- **وضعیت فعلی و مشکل دقیق:** Compose با NODE_ENV=production پیش‌فرض SEED_ON_START=true دارد؛ seed از mock fixtures قیمت می‌سازد و updatedAt جدید و isStale=false می‌گذارد. guard عدم ایجاد dev admin این خطر تجاری را حل نمی‌کند.
- **شدت مشکل:** Critical · **احتمال وقوع:** بالا در دیتابیس تازه/خالی.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** قیمت ساختگی با ظاهر معتبر می‌تواند مبنای تصمیم مشتری و استعلام شود؛ Revenue/اعتماد و محتوای قابل crawl در خطر؛ سفارش اشتباه live مشاهده نشده.
- **شواهد از پیاده‌سازی سایت:** docker-compose.yml:47 و 75؛ web/docker-entrypoint.sh:12؛ db/seed.ts:14–17 و 223–266
- **راه‌حل پیشنهادی:** پیش‌فرض seed خاموش؛ منع fixture seed در production و تفکیک bootstrap تنظیمات از کاتالوگ آزمایشی.
- **اولویت اجرا:** P0 · **سختی/هزینه اجرا:** ۱–۲ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بسیار بالا، حفاظت از تداوم فروش/داده. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** startup production روی DB خالی هیچ SKU/قیمت/مقاله mock نسازد؛ seed fixture در production fail کند؛ bootstrap فقط داده مصوب.

## K-275 — idempotency seed و حفظ داده واقعی · 40/100

- **وضعیت فعلی و مشکل دقیق:** guard جدول غیرخالی و دو تست article مفیدند؛ force می‌تواند قیمت واقعی را upsert و تاریخچه را DELETE کند. crash پس از اولین SKU موجب می‌شود اجرای بعد کل block SKU را skip کند و bootstrap ناقص بماند.
- **شدت مشکل:** High · **احتمال وقوع:** متوسط هنگام crash/force.
- **دلیل مسئله و تأثیر Revenue / Conversion / SEO / UX:** قیمت overwrite، تاریخچه از دست‌رفته یا کاتالوگ ناقص یعنی زیان فروش و اعتماد؛ SEO با تغییر محتوای محصول آسیب می‌بیند.
- **شواهد از پیاده‌سازی سایت:** web/scripts/seed.ts:24؛ db/seed.ts:211–286؛ db/seed.test.ts
- **راه‌حل پیشنهادی:** force ممنوع در production، bootstrap اتمیک و resumable با شناسه داده مصوب؛ migration داده یک‌بارمصرف از fixture جدا.
- **اولویت اجرا:** P1 · **سختی/هزینه اجرا:** ۲–۴ روز؛ متوسط.
- **تخمین Impact اصلاح:** کاهش ریسک شرح‌داده‌شده؛ بالا، کاهش خطا یا فشار عملیاتی. مبلغ دقیق نیازمند پارامترهای مالی ابتدای گزارش است.
- **مثال سایت‌های برتر / مرجع قابل راستی‌آزمایی:** [PostgreSQL 16: constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) — مرجع فنی invariant. مثال شرکت مرتبط، [Stripe](https://stripe.com/blog/online-migrations) در حفظ صحت داده حین تغییر است؛ جزئیات constraint/seed/CRM داخلی آن شرکت معلوم نیست.
- **Acceptance Criteria:** seed دوباره هیچ داده واقعی را تغییر ندهد؛ kill بعد اولین SKU و retry به حالت کامل برسد؛ FORCE_RESEED در production رد شود.

## جزئیات FKهای نیازمند تصمیم

اسکن محافظه‌کارانه ۱۱ candidate برگرداند؛ `covered=false` حکم خودکار ساخت index نیست:

- ۹ FK تک‌ستونی بدون index کامل: `order_fulfillments.reservation_id`، `price_points.actor_id`، `warehouse_cash_entries.order_id`، `warehouse_cash_entries.settlement_id`، `warehouse_cash_entries.warehouse_item_id`، `warehouse_reservations.order_item_id`، `warehouse_reservations.owner_id`، `warehouse_withdrawals.reservation_id`، `warehouse_withdrawals.warehouse_item_id`.
- `orders.lead_id`: unique partial فقط ردیف‌های `deleted_at IS NULL` را پوشش می‌دهد؛ lookup ارجاع شامل archiveها الزاماً آن را استفاده نمی‌کند.
- FK ترکیبی `skus(sub_category_id,category_id)`: index تک‌ستونی sub_category_id وجود دارد؛ بخشی از lookup را پوشش می‌دهد. نیاز به composite باید با cardinality و plan سنجیده شود؛ این یک false-positive برای تعبیر «کاملاً بی-index» است.

خود PostgreSQL روی ستون ارجاع‌دهنده FK خودکار index نمی‌سازد. [مرجع PostgreSQL](https://www.postgresql.org/docs/16/ddl-constraints.html)

## برنامه اجرایی پیشنهادی

1. **فوری:** seed fixture production خاموش و ممنوع؛ backup تمام DBها و مقصد خارج host تأیید؛ restore جدید روی محیط جدا؛ gate شکست backup در deploy.
2. **قبل از migration بعدی:** مسیر expand/contract و rollback N−1؛ lock/hash gate و PG16 چنداتصالی در CI؛ timeout و تست قطع اتصال.
3. **sprint بعد:** CHECK هدف/مقدار alerts، version CRM، indexهای دارای توجیه plan و workload.
4. **مقیاس:** query budget، batch token recovery، ظرفیت/partition و archive، مشاهده index usage طی دوره نماینده.

P0ها با یک «command موفق» بسته نمی‌شوند؛ مدرک نهایی باید به SHA release، محیط، زمان و نتیجه invariantهای کسب‌وکار متصل باشد.

## فایل‌های شواهد و بازتولید

- [اسکریپت offline قابل تکرار](../web/scripts/auditDatabaseK.mts): فقط PGlite موقت، بدون DATABASE_URL.
- [journal](audit-k-evidence/journal.json)، [schema/FK/index/check](audit-k-evidence/offline-schema.json)، [خلاصه offline](audit-k-evidence/offline-summary.json).
- [metadata محلی واقعی](audit-k-evidence/local-database.json)، [مقایسه hash/column محلی](audit-k-evidence/local-comparison.json)، [planهای نمونه محلی](audit-k-evidence/local-plans.json).

```sh
cd web
pnpm exec tsx scripts/auditDatabaseK.mts
pnpm exec vitest run src/lib/server/db/schemaCascade.test.ts src/lib/server/db/seed.test.ts src/lib/server/services/operations.pg.test.ts src/lib/auth/service.pg.test.ts src/lib/server/repos/catalogRepo.search.pg.test.ts src/lib/server/services/pricing.adminGrid.pg.test.ts src/lib/server/repos/catalogRiskyDelete.pg.test.ts src/lib/server/repos/catalogDelete.pg.test.ts
```

اسکریپت offline مقایسه schema را به وجود ستون/nullable محدود می‌کند؛ duplicate detector تنها برابری دقیق تعریف پس از USING و نوع unique را می‌سنجد؛ index overlap، default drift، داده production و رفتار optimizer در حجم بالا همچنان نیازمند ارزیابی مستقل‌اند. هیچ گذرواژه، connection URL یا ردیف مشتری در شواهد ذخیره نشده است.
