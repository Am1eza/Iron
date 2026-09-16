# وضعیت آدیت K — دیتابیس، migration و یکپارچگی (۲۰۲۶-۰۹-۱۷)

> همان قاعدهٔ [audit-status.md](audit-status.md): **بنر بالای یک سند، شاهد نیست.**
> هیچ بندی اینجا به‌خاطر وجود کد «بسته» شمرده نشده؛ یا تست/گیت واقعی روی
> PostgreSQL اجرا شده، یا صادقانه باز گزارش شده است.

## پاسخ کوتاه به «همه ۱۰۰ از ۱۰۰»

**امروز شدنی نیست، و ادعایش دقیقاً همان بیش‌ادعایی است که خودِ آدیت K نقد می‌کند.**
نمرهٔ این آدیت «آمادگی اثبات‌شده» است، نه «درصد سلامت کد». پس بالا رفتن نمره
نیازمند **مدرک** است، و سه دسته مدرک از این لپ‌تاپ تولید نمی‌شوند:

1. **زمان.** معیار پذیرش K-254 صریحاً «۳۰ روز نمونه شامل jobs و پایان ماه» است.
   هیچ‌کس امروز این را نمی‌بندد. تنها کار ممکن، **شروع ساعت** است — که انجام شد.
2. **دسترسی production.** K-246/252/255/269/271/272 مدرکشان روی داده و میزبان
   واقعی است: fingerprint سه محیط، مدت واقعی lock، p95 واقعی، نرخ رشد واقعی،
   مخزن restic واقعی و یک restore واقعی.
3. **تصمیم مالک.** K-273 «محل escrow و مسئول آن» می‌خواهد؛ این یک تصمیم سازمانی
   است، نه یک commit.

بقیه — یعنی کاری که واقعاً در کد بسته می‌شود — در این نوبت و نوبت‌های هم‌زمان
انجام شد.

## روش راستی‌آزمایی این نوبت

- کار در worktree جدا (`audit/k-database`) انجام شد، چون دو نشست دیگر هم‌زمان
  روی همین فایل‌ها در `/Users/amirreza/Iron` می‌نوشتند. کار در جریان آن‌ها
  ابتدا بدون تغییر replay شد (commit پایه) تا سهم هر کس قابل تفکیک بماند.
- **۷۹ تست سبز** (۷۰ تای آدیت + ۹ تای جدید)، `tsc --noEmit` پاک.
- **سه گیت روی PostgreSQL واقعی (15.14 محلی)** اجرا و سبز شدند:
  `checkMigrationPolicy` · `checkBackCompat` · `checkDatabaseK`
  (دو runner هم‌زمان، ۱۰ restart، رد tamper، rollback بعد از DDL ناموفق، بازیابی
  بعد از statement timeout).
- هر گیت تازه **با شکستن عمدی اعتبارسنجی شد** — گیتی که هیچ‌وقت قرمز نشود بی‌ارزش است.

> ⚠️ محلی PG **15.14** است و production **PG16**. این دقیقاً موضوع K-247 است؛
> پس «سبز محلی» برای بندهای وابسته به موتور، مدرک production نیست.

## وضعیت هر ۳۰ بند

| بند | وضعیت | مدرک امروز / چه چیزی باقی مانده |
|---|---|---|
| K-246 fingerprint schema | 🟡 جزئی | drift gate در CI هست؛ fingerprint سه‌محیطی (default/constraint/extension/نسخهٔ موتور) ساخته نشده — **نیازمند production** |
| K-247 drift PG16 | 🟡 کد آماده | job `database` با `postgres:16-alpine` به CI اضافه شد؛ مدرک = یک اجرای واقعی CI |
| K-248 ترتیب و journal | ✅ بسته | hash **تمام** migrationهای اعمال‌شده پیش از هر DDL بررسی می‌شود؛ tamper در گیت **رد شد** |
| K-249 idempotency/restart | ✅ بسته | advisory lock؛ **۲ runner هم‌زمان + ۱۰ restart** سبز |
| K-250 شکست نیمه‌کارهٔ deploy | 🟡 جزئی | شکست backup حالا deploy را **متوقف** می‌کند؛ migration پیش از `up -d web`؛ fault injection وسط DDL سبز. باقی: smoke کسب‌وکار پس از recovery + runbook |
| K-251 سازگاری N−1 | ✅ بسته *(این نوبت)* | گیت جدید: **۵۸ جدول / ۵۴۶ ستون** روی schema جدید؛ negative-test دوطرفه؛ مسیر `-- contract-release` برای پایان expand/contract |
| K-252 migration قفل‌کننده | 🟡 جزئی | مسیر `CREATE INDEX CONCURRENTLY` + `lock_timeout=5s`. باقی: اندازه‌گیری بودجهٔ lock روی **دادهٔ هم‌اندازهٔ production** |
| K-253 پوشش index FK | 🟡 جزئی | `0067` ده index را ساخت. باقی: تصمیم مکتوب برای هر candidate + EXPLAIN روی حجم واقعی |
| K-254 index تکراری/بلااستفاده | ⏳ **نیازمند ۳۰ روز** | collector ساخته و اجرا شد (۵۹ جدول، ۱۹۶ index، **۲ candidate تکراری**). با اولین اجرای زمان‌بندی‌شده ساعت شروع می‌شود |
| K-255 query plan | 🔴 باز | harness ثبت SQL واقعی + `EXPLAIN ANALYZE BUFFERS` ساخته نشده — **نیازمند دادهٔ نماینده** |
| K-256 N+1 | 🟡 جزئی | fan-out توکن به **یک** query تبدیل شد. باقی: تست شمارش query با ۱۰ و ۱۰۰ ردیف |
| K-257 ماتریس ON DELETE | 🔴 باز | ۶۵ FK فهرست شده‌اند اما ماتریس تصمیم دامنه + تست هر رابطه نوشته نشده |
| K-258 cascade مخرب | ✅ بسته *(این نوبت)* | trigger پایگاه‌داده حذف SKU دارای تاریخچهٔ قیمت را **رد می‌کند**؛ چهار مسیر admin با `SET LOCAL` مجوز purge می‌گیرند؛ تست نشت‌نکردن مجوز روی pool |
| K-259 nullable/XOR هدف | ✅ بسته | `alerts_target_ck`؛ چهار حالت ناسازگار در تست **رد شدند** |
| K-260 CHECK مقدار/وضعیت | ✅ بسته | CHECKهای `0068` روی alerts/order_items/outbox/warehouse؛ تست سبز |
| K-261 یکتایی | 🟡 جزئی | CHECK هدف بست؛ سیاست dedup برای soft-delete و channel هنوز تصمیم‌نشده |
| K-262 duplicate همزمانی | 🟡 جزئی | **۲ اتصال واقعی** سبز. باقی: ۵۰ writer واقعی |
| K-263 transaction چندجدولی | 🟡 جزئی | seed حالا اتمیک و زیر advisory lock است. باقی: تست replay نکردن outbox |
| K-264 isolation | 🔴 باز | تست invariant با چند اتصال و بازیابی deadlock نوشته نشده |
| K-265 lost update پنل | ✅ بسته | `leads.version` + trigger + `expectedVersion` در API؛ ویرایش متعارض **۴۰۹** می‌گیرد |
| K-266 بودجهٔ pool | 🟡 جزئی | بودجه در `poolConfig` اعتبارسنجی و در صورت تخطی **fail-fast** می‌شود. باقی: load test ۲× peak |
| K-267 pool در restart | ✅ بسته | `pool.on('error')` + supervisor واقعی برای jobs در entrypoint |
| K-268 timeout | ✅ بسته | statement/lock/idle در کلاینت؛ **قطع `pg_sleep` و بازگشت سالم اتصال** در گیت اثبات شد |
| K-269 رشد و اشباع | ⏳ نیازمند دو خوانش | همان collector؛ با `DATABASE_DISK_BYTES` تاریخ عبور از آستانهٔ ۳۰٪ را می‌دهد — **نیازمند production** |
| K-270 archive و retention | 🟡 جزئی | DELETE یکجا به **batch ۵۰۰تایی با SKIP LOCKED** تبدیل شد. باقی: archive پیش از حذف + checksum |
| K-271 backup همهٔ DBها | 🟡 کد آماده | اسکریپت حالا ahantime + glitchtip + MariaDB + globals + uploads + SHA256SUMS، و **بدون مخزن off-host شکست می‌خورد**. مدرک = یک اجرای واقعی |
| K-272 restore واقعی | 🟡 کد آماده | `ahantime-restore-drill.sh` در کانتینر یکبارمصرف با تأیید checksum. مدرک = **یک drill واقعی با RTO ثبت‌شده** |
| K-273 رمزنگاری و کلید | 🔴 تصمیم مالک | محل escrow، مسئول آن و drill کلید recovery |
| K-274 seed ناخواستهٔ production | ✅ بسته | `SEED_ON_START` در compose ثابتاً `false`؛ seed در `NODE_ENV=production` **exception می‌دهد** |
| K-275 idempotency seed | 🟡 جزئی | seed اتمیک + advisory lock. باقی: تست kill بعد از اولین SKU و رسیدن به حالت کامل |

**جمع (۳۰ بند):** ۱۰ بسته · ۱۴ جزئی/کدآماده · ۳ باز · ۲ نیازمند زمان · ۱ تصمیم مالک.

## برای بالا بردن نمره، به ترتیب اثر

1. **زمان‌بندی collector** (`observeDatabase.mjs`, روزانه). تنها کاری که ساعتِ
   ۳۰ روزهٔ K-254 را شروع می‌کند؛ هر روز تأخیر، یک روز تأخیر در بستن آن بند است.
2. **یک restore drill واقعی** با RTO ثبت‌شده → K-272 و بخش بزرگی از K-271.
3. **اجرای CI روی PG16** → K-247، و اعتبار محلیِ همهٔ گیت‌ها را به موتور هدف می‌برد.
4. **harness EXPLAIN روی دادهٔ نماینده** → K-255، و مدرکِ لازم برای K-252/253.
5. **تصمیم escrow** → K-273.

## آنچه این نوبت عمداً انجام نداد

- هیچ چیزی روی production اجرا یا مستقر نشد.
- `.env` خوانده نشد.
- هیچ migration مخرب یا حذف داده‌ای نوشته نشد؛ `0069` فقط **منع** اضافه می‌کند.
- کار در `/Users/amirreza/Iron` (checkout مشترک) نوشته نشد.
