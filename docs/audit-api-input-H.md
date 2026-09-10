# آدیت سخت‌گیرانهٔ H — امنیت API و ورودی‌ها

تاریخ: ۲۰۲۶-۰۹-۱۰؛ دامنه: بندهای ۱۷۱ تا ۲۰۰؛ ارزیابی مستقیم روی کد فعلی repository،
با اجرای واقعی روی PostgreSQL 15 disposable (نه pglite، نه فرض).

## نتیجهٔ فعلی: ۹۳ از ۱۰۰ — هنوز ۱۰۰ نیست

> **نوبت ۲۰۲۶-۰۹-۱۱ — H-171 و H-173 از «بررسی یک‌باره» به artifact خودکار و CI-locked تبدیل شدند:**
>
> **H-171 (بود ۹۵):** خودِ سند نوشته بود «تکمیل واقعی نیازمند یک تست مشابه
> `adminApiConventions.test.ts` است که هر route زیر admin باید
> `requireApiPermission` داشته باشد را در CI enforce کند — این تست امروز
> وجود ندارد». این نوبت آن تست نوشته شد: `web/scripts/lib/routeInventory.ts`
> (منطق) + `web/scripts/routeInventory.ts` (CLI قابل اجرای مستقل —
> `pnpm exec tsx scripts/routeInventory.ts` گزارش auth/rate-limit/validateBody
> را per-family چاپ می‌کند) + `web/scripts/routeInventory.test.ts` (تست
> vitest که در هر اجرای مجموعهٔ تست پروژه دوباره چک می‌شود، نه فقط دستی).
> این تست چهار ادعا را enforce می‌کند: (۱) هر مسیر `/api/admin/**` یکی از
> `requireApiPermission`/`requireApiUser`/`getSessionVerified` را صدا می‌زند
> (صفر استثنا — دوباره تأیید شد، اکنون به‌صورت خودکار)، (۲) همین برای
> `/api/me/**`، (۳) هر route.ts با POST/PUT/PATCH/DELETE یا `validateBody`
> صدا می‌زند یا در یک allowlist صریح با دلیل مکتوب است (۲۵ مسیر — هرکدام
> جداگانه خوانده و تأیید شد که یا بدون body واقعی هستند، یا با
> `readJsonBody`+zod `safeParse` دستی معادل `validateBody` اعتبارسنجی
> می‌شوند، یا multipart/form-data با size-cap+magic-byte/ExcelJS، یا یک
> webhook عمداً بدون schema که field-by-field دفاعی parse می‌شود؛ **هیچ گپ
> واقعی پیدا نشد** — نگاه کنید به `routeInventory.test.ts`'s
> `VALIDATE_BODY_EXEMPT` برای فهرست کامل با دلیل هرکدام)، (۴) خودِ
> allowlist هیچ ورودی کهنه ندارد (اگر یک route بعداً `validateBody` بگیرد یا
> حذف شود، تست این را هم می‌گیرد). شمارش `pnpm exec tsx
> scripts/routeInventory.ts` روی این نوبت: ۱۵۴ route، admin auth ۹۴/۹۴
> (۱۰۰٪)، me auth ۱۸/۱۸ (۱۰۰٪)، admin rate-limit ۳/۹۴ (۳٪ — دقیقاً همان رقم
> H-185، عمداً hard-fail نشد چون H-185 این را یک تغییر ساختاری جداگانه با
> scope خودش می‌داند، نه رگرسیون این بند). rate-limit coverage عمداً فقط
> **گزارش** می‌شود نه enforce، تا این تست CI را بابت شکاف شناخته‌شدهٔ دیگری
> (H-185) قرمز نکند.
>
> **H-173 (بود ۹۶):** سند نوشته بود «بررسی کامل‌تر روی تمام ۶۷ schema (نه
> فقط چهار موردی که نوبت قبل پیدا شد) با یک اسکریپت خودکار (نه grep دستی)
> انجام نشده». این نوبت آن اسکریپت نوشته شد:
> `web/scripts/lib/zodStringMaxScan.ts` — یک AST walker واقعی (نه regex؛
> TypeScript Compiler API) که هر فراخوانی `z.string()` را پیدا می‌کند و زنجیرهٔ
> متدهای chain‌شده رویش (`.max`, `.length`, `.regex`, `.uuid`, `.superRefine`,
> …) را دنبال می‌کند تا ببیند محدود شده یا نه؛ یک کامنت `// unbounded: ...`
> هم یک exemption صریح و مستند است. `web/scripts/schemaLengthCapScan.ts`
> این را روی کل `lib/validation/**` (به‌جز `env.ts` — پیکربندی عملیاتی
> است، نه ورودی کاربر) و هر `route.ts` زیر `app/api/**` اجرا می‌کند —
> نه فقط چهار schema که grep دستی نوبت قبل پیدا کرد. نتیجهٔ اجرای این
> نوبت (پیش از اصلاح): **۳۹ فیلد `z.string()` بدون سقف** در ۱۵ فایل واقعی
> پیدا شد (نمونه: `marketValueSchema.label/unit/updatedAt`،
> `admin/catalog/skus`'s `subCategoryId`/`crossListedCategoryIds`،
> `admin/settings`'s `putPayload.key`/`CLUB_CONFIG.tiers` record key،
> `me/verification`'s `nationalId`/`companyNationalId`/`economicCode`
> — این سه‌تا فرمت ثابت دارند و validation واقعی‌شان
> `isValidNationalId`/... در `verificationRepo.ts` است، اما در سطح Zod
> هیچ سقفی نداشتند). همهٔ این ۳۹ مورد در همین نوبت **رفع** شد (سقف‌های
> ۲۰ تا ۱۲۰ کاراکتر، هم‌مقیاس با الگوی موجود در بقیهٔ اپ — `skuId`≤۱۲۰،
> شناسه‌های دیگر≤۶۴). **۱۶ مورد دیگر عمداً رفع نشد**: چهار route زیر
> `admin/operations`, `admin/warehouse[/settlements]`,
> `me/warehouse/operations` — این فایل‌ها را طبق دستور صریح این نشست
> («یک جریان کاری جدا هم‌زمان روی order/warehouse کار می‌کند») دست نزدم؛
> این استثنا در خودِ اسکریپت (`DEFERRED_ORDER_WAREHOUSE_FILES`) با کامنت
> مستند شده، نه یک حذف بی‌صدا. اسکریپت اکنون در
> `web/scripts/schemaLengthCapScan.test.ts` به‌صورت یک تست vitest
> CI-enforced قفل شده — یک PR آینده که یک `z.string()` جدید بدون سقف در هر
> schema دیگری (به‌جز چهار فایل مستثنا‌شدهٔ بالا) اضافه کند، این تست را
> قرمز می‌کند. شواهد: `web/scripts/lib/zodStringMaxScan.test.ts` (۷ تست
> واحد روی خودِ scanner — ثابت می‌کند یک فیلد بدون سقف را می‌گیرد، یک فیلد
> با `.max()`/chain چندخطی/fixed-format/کامنت مستند را رد نمی‌کند)،
> `web/scripts/lib/routeInventory.test.ts` (۵ تست روی خودِ inventory
> builder با فیکسچرهای موقت).
>
> **شواهد اجرای کامل این نوبت** (نه فقط این دو بند؛ کل کار جانبی
> F-131/F-146/F-150 هم همین نوبت انجام شد — نگاه کنید به docs/audit-auth-F.md):
> `tsc --noEmit` پاک؛ `eslint` پاک روی هر فایل تغییریافته؛ روی یک
> PostgreSQL 15 disposable واقعی (`initdb`+`pg_ctl` محلی، migrate شده از صفر
> تا آخرین migration — `0061_rate_limit_windows`) — `vitest run` سراسری
> **۲۹۲ فایل، ۳۳۴۶ تست، همه PASS**؛ `next build` تولیدی (Turbopack) با
> `DATABASE_URL` واقعی — **exit 0، صفر خطا**. توجه: worktree این نوبت پایهٔ
> `main@ef276bbb` است و شامل merge بندهای H-172 (سقف query در `/api/search`)
> که در نسخهٔ دیگری از این سند دیده شده **نیست** — آن کار ظاهراً هنوز در یک
> checkout موازی commit نشده؛ این نوبت روی H-171/H-173 مستقل از آن کار انجام
> شد و به آن وابسته نبود.
>
> جدول امتیاز پایین برای ۱۷۱ و ۱۷۳ به‌روزرسانی شد؛ سرجمع ۹۳/۱۰۰ بالای سند
> عمداً بازمحاسبه نشد — تغییر دو بند از ۳۰ (هرکدام چند واحد) میانگین کل را
> کمتر از یک واحد جابه‌جا می‌کند و بدون بازخوانی هر ۲۸ بند دیگر یک عدد
> صحیح جدید ادعا کردن دقیقاً همان «ظاهر خوب بدون شاهد» است که این سند از
> ابتدا رد می‌کند.

نمره میانگین مساوی ۳۰ محور است؛ گواهی انطباق یا امتیاز احتمال حمله نیست. برخلاف
آدیت‌های E و F که با یک baseline پایین (به‌ترتیب ۳۷ و شروع‌شده از شکاف‌های Critical)
آغاز شدند، این بخش یک الگوی متفاوت نشان داد: **بیشتر سطح حملهٔ ورودی این اپ از قبل،
در نشست‌های قبلی (نه این آدیت)، سخت شده بود** — escaping کامل wildcard در
`likeEscape.ts`، معماری رندر مقاله بدون `dangerouslySetInnerHTML` (به‌جای «sanitize
کردن HTML»، اصلاً HTML خامی وجود ندارد که sanitize شود)، redaction بازگشتی
لاگ با الگوی مقدار (نه فقط نام فیلد)، idempotency به‌درستی scope‌شده با TTL، و
timeout روی **هر** fetch سروری. این‌ها را «تأیید ظاهری» نکردم — هرکدام با شاهد
مستقیم کد (و برای دو مورد، اجرای واقعی) زیر بررسی شده‌اند.

با این‌حال سه دسته مشکل واقعی پیدا و در همین نشست **رفع** شد (نه فقط ثبت):
سقف طول رشته در چهار فیلد ورودی عمومی (فرم تماس/همکاری/درخواست/محاسبه‌گر)،
و نبود rate limit روی دو مسیر rotation نشست. یک شکاف واقعی و بزرگ‌تر — نبود
rate limit مستقل روی هیچ‌یک از ۹۴ مسیر `/api/admin/**` — **عمداً رفع نشد**؛
دلیلش در H-185 آمده.

### اصلاحات واقعی این نوبت

1. **H-173** — `contactSchema`, `cooperationSchema`, `requestSchema`, `weightSchema`
   (`web/src/lib/validation/schemas.ts`) فاقد `.max()` روی فیلدهای متنی بودند —
   برخلاف الگوی خودِ همین فایل در `profileSchema`/`api.ts`. اضافه شد:
   `name`≤۶۰، `company`≤۱۲۰، `product`≤۲۰۰، `message`≤۲۰۰۰ (contact/cooperation)،
   `category`/`size`≤۶۰ (weight). تست جدید: `schemas.test.ts` (+۷ مورد).
2. **H-185 (بخشی)** — `/api/auth/refresh` و `/api/auth/silent` هیچ rate limit
   نداشتند، برخلاف `otp-request`/`otp-verify`؛ هرکدام یک rotation واقعی روی
   PostgreSQL (قفل ردیف + نوشتار) انجام می‌دهند. `rateLimit(req, 'auth-refresh',
   {limit:60, windowMs:60_000})` اضافه شد؛ در `silent` (که یک ناوبری کامل صفحه
   است، نه فراخوانی fetch) پاسخ محدودیت به‌جای JSON خام ۴۲۹، یک redirect به
   صفحهٔ ورود است — تا مرورگر صفحهٔ شکسته نشان ندهد.

### شواهد اجرای این نوبت

- PostgreSQL 15 disposable واقعی (`initdb`+`pg_ctl`، نه Docker، نه pglite):
  هر ۶۰ migration از صفر اجرا شد.
- `pnpm vitest run` سراسری روی این دیتابیس: **۲۸۶ فایل، ۳۳۱۳ تست، همه PASS**
  (۵ تست جدید نسبت به تعداد ثبت‌شده در پایان آدیت E همان روز).
- `npm run build` تولیدی: **exit 0**، صفر خطا.
- `TypeScript`/`ESLint` روی هر فایل تغییریافته: پاک.
- دو بار تکرار کامل «drop → create → migrate → test» برای رد کردن آلودگی
  fixture بین اجراهای دستی خودم (یک بار واقعاً رخ داد و مستند شد — به همین
  دلیل توصیه در این سند این است که CI هرگز یک دیتابیس دائمی/مشترک بین اجراها
  استفاده نکند، نکته‌ای که خارج از دامنهٔ H است اما همین‌جا کشف شد).

## روش، شواهد سایت و محدودیت

بازیابی وب صفحات عمومی (`/`, `/search`, `/prices`) پوستهٔ سایت را نشان داد؛ رفتار
واقعی API فقط از کد و اجرای محلی آن قابل اثبات بود، نه از خروجی مرورگر خزیده‌شده.
تست نفوذ زندهٔ Production (SQLi واقعی، XSS واقعی، حملهٔ SSRF واقعی) روی
ahantime.com انجام **نشد** — طبق قاعدهٔ این مخزن (بدون اجازهٔ صریح مالک برای
pentest زنده) و چون Cloudflare (docs/audit-rbac-panel-G.md §G-152) هرگونه
دستکاری Host/SNI را پیش از رسیدن به مبدأ رد می‌کند و از این Mac قابل دور زدن
نیست. هر ادعا از این سند مسیر `file:line` واقعی دارد؛ acceptance criteria هرکدام
یا با تست خودکار موجود پوشش دارد یا صریحاً «فقط بررسی کد، نه اجرای زنده» علامت
خورده است.

منابع مقایسه: [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)،
[OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)، الگو هستند نه گواهی انطباق سایت.

Impact مالی به‌صورت سناریوی کیفی بیان شده؛ GMV، هزینهٔ واقعی حمله، و نرخ رخداد
Production در دسترس نیست.

---

## جدول امتیاز

| بند | محور | نمره از ۱۰۰ | شدت | اولویت |
| --- | --- | ---: | --- | --- |
| 171 | inventory کامل ۱۵۴ route | 99 (CI-locked این نوبت — نگاه کنید به یادداشت بالا) | N/A | P3 |
| 172 | validation کامل body/query/params/headers | 88 | Low | P2 |
| 173 | سقف طول string | 99 (اسکن خودکار کل schema این نوبت — نگاه کنید به یادداشت بالا) | Medium (پیش از اصلاح) | P1 (انجام شد) |
| 174 | سقف array/عمق JSON | 92 | Low | P2 |
| 175 | Content-Type اشتباه / body malformed | 98 | N/A | N/A |
| 176 | مقابله با mass assignment | 94 | Low | P2 |
| 177 | مقابله با SQL injection | 97 | N/A | N/A |
| 178 | escape شدن wildcard در LIKE | 97 | N/A | N/A |
| 179 | مقابله با IDOR | 90 | Low | P2 |
| 180 | مقابله با XSS ذخیره/reflected | 96 | N/A | N/A |
| 181 | sanitize خروجی TipTap | 96 | Low | P3 |
| 182 | جلوگیری از javascript: URL و event handler | 95 | N/A | N/A |
| 183 | مقابله با prototype pollution | 94 | N/A | N/A |
| 184 | محدودیت اندازهٔ request | 93 | Low | P2 |
| 185 | rate limit جدا برای دسته‌های مختلف | 74 | High (برای admin) | P1 |
| 186 | مقابله با spam فرم | 78 | Medium | P2 |
| 187 | جلوگیری از replay | 85 | Low | P2 |
| 188 | صحت idempotency key | 97 | N/A | N/A |
| 189 | جلوگیری از cache poisoning | 93 | Low | P3 |
| 190 | عدم نشت stack/SQL error | 97 | N/A | N/A |
| 191 | consistency قالب خطا | 90 | Low | P3 |
| 192 | صحت status codeها | 90 | Low | P3 |
| 193 | کنترل CORS | 95 | N/A | N/A |
| 194 | کنترل HTTP methodهای اضافی | 92 | N/A | N/A |
| 195 | جلوگیری از method override | 100 | N/A | N/A |
| 196 | کنترل redirect باز | 94 | Low | P2 |
| 197 | SSRF در URL قابل‌تنظیم | 90 | N/A (سطح حمله موجود نیست) | N/A |
| 198 | DNS rebinding | 88 | N/A (سطح حمله موجود نیست) | N/A |
| 199 | timeout/abort/size-limit روی fetch سروری | 96 | Low | P3 |
| 200 | redaction لاگ | 98 | N/A | N/A |

---

## یافته‌های تفصیلی

### H-171 — inventory کامل ۱۵۴ route و تعیین auth، role، rate limit و schema — 95/100

- **وضعیت فعلی:** `find src/app/api -name route.ts | wc -l` → **۱۵۴** (نه ۱۵۱ — عدد در متن درخواست کمی قدیمی است؛ تفاوت به معنی route جاماندهٔ ناامن نیست، فقط رشد طبیعی است). هر ۱۵۴ فایل مستقیم خوانده/grep شد، نه نمونه‌برداری.
- **یافته‌های ساختاری (نه حدس):**
  - هر ۹۴ مسیر زیر `/api/admin/**` دقیقاً یکی از `requireApiPermission`/`requireApiUser`/`getSessionVerified` را صدا می‌زند (`grep -L` روی این سه الگو صفر نتیجه داد) — **صفر مسیر admin بدون فراخوانی auth**. هر مسیری که `requireApiUser` را صدا می‌زند، `requireApiPermission` را هم دارد (صفر نتیجه برای عکس آن) — یعنی هیچ مسیر adminی به «صرفاً لاگین‌بودن» بسنده نمی‌کند؛ نقش/permission همیشه چک می‌شود. این مستقل از (و مکمل) لایهٔ rewrite در `middleware.ts` است (docs/audit-rbac-panel-G.md).
  - هر مسیر زیر `/api/me/**` به `requireApiUser`/`getSessionVerified` مسلح است (صفر استثنا).
  - جدول کامل rateLimit: ۳۲ فراخوانی مجزا با scope name/limit/window مشخص (فهرست کامل در H-185).
  - `validateBody` در ۶۷ فایل استفاده شده؛ `validateQuery` به این نام **وجود ندارد** — هیچ helper سراسری برای اعتبارسنجی query string نیست (جزئیات در H-172).
- **مشکل دقیق:** خودِ inventory یک یافتهٔ امنیتی نیست، اما این نوبت یک شکاف واقعی از دلِ آن بیرون آمد: صفر از ۹۴ مسیر admin دارای rate limit اختصاصی است (به H-185 مراجعه شود) — این حقیقت فقط با ساختن این inventory کامل قابل کشف بود، نه با نمونه‌برداری چند مسیر.
- **شدت:** N/A (خودِ بند).
- **شواهد:** `/tmp` scratch script روی `find + grep`؛ نتایج در بندهای بعدی همین سند تکرار شده‌اند تا جدول اصلی خیلی حجیم نشود؛ فایل خام inventory در این commit ذخیره نشده (حجم بالا، ابزار قابل بازتولید: یک خط `find`+`grep`).
- **راه‌حل پیشنهادی:** ندارد فوری — inventory خودش انجام شد.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** انجام شد (~۲ ساعت واقعی این نوبت).
- **چرا هنوز ۱۰۰ نیست:** جدول کامل route-by-route با هر ستون (auth/role/rate-limit/schema) به‌صورت یک artifact نگهداری‌شده در repo ذخیره نشد — اگر یک route جدید فردا اضافه شود، هیچ تست CI این inventory را دوباره اعتبارسنجی نمی‌کند؛ فقط یک بررسی دستیِ یک‌بارهٔ این نشست است.
- **Acceptance Criteria:** برای همین نشست برآورده (شمارش کامل + دو ادعای ساختاری با grep صفر-استثنا اثبات شد). تکمیل واقعی نیازمند یک تست مشابه `adminApiConventions.test.ts` (که G برای no-store/audit ساخت) است که "هر route زیر admin باید requireApiPermission داشته باشد" را در CI enforce کند — این تست امروز وجود ندارد.

### H-172 — validation کامل body، query، params و headers — 88/100

- **وضعیت فعلی:** body: `validateBody`+Zod در تمام ۶۷ مسیری که body می‌پذیرند (شمارش مستقیم). route params ([id]/[ref]/[slug]) عموماً یا مستقیم به یک query پارامتری‌شده (Drizzle) می‌روند (امن ذاتاً در برابر injection، صرف‌نظر از نوع) یا `decodeURIComponent` می‌شوند و در یک lookup برابری استفاده می‌شوند (نه در ساخت SQL خام).
- **مشکل دقیق:** query string **هیچ helper مشترکی مثل `validateBody` ندارد**. نمونهٔ واقعی: `src/app/api/search/route.ts:16` — `const q = (req.nextUrl.searchParams.get('q') ?? '').trim();` فقط حداقل طول (۲) چک می‌شود، **بدون سقف بالا**. طول واقعی توسط چیزی در این اپ محدود نمی‌شود؛ تنها backstop، محدودیت طول URL در لایهٔ Caddy/Cloudflare است (که این مخزن آن را کنترل نمی‌کند). یک query دو-کاراکتری معتبر و یک query ۵۰۰۰۰-کاراکتری هر دو از این خط رد می‌شوند و به `searchSkus`/`searchArticles` (که `likeContains` را صدا می‌زنند) می‌رسند — ILIKE‌کردن یک رشتهٔ خیلی بلند هزینهٔ CPU دارد (نه injection، چون escape می‌شود).
- **شدت:** Low (نه injection؛ فقط هزینهٔ CPU/DoS جزئی، و آن هم پشت rate limit ۳۰/دقیقه است).
- **چرا مشکل است / Impact مالی:** یک مهاجم با ۳۰ درخواست در دقیقه (سقف rate limit) و هرکدام یک query چندصدهزار کاراکتری می‌تواند هزینهٔ CPU هر query را چند برابر عادی کند؛ روی هاست تک‌هستهٔ فعلی (docs/PRODUCTION-AUDIT.md's «1.5GB/4-vCPU») این محسوس است.
- **تأثیر Revenue/Conversion/SEO/UX:** پایین/پایین/ناچیز/پایین.
- **شواهد:** `src/app/api/search/route.ts:16`؛ همان الگو در `src/app/api/admin/search/route.ts` (بررسی نشد به‌صورت عمیق — نمونه، نه اثبات کامل).
- **راه‌حل پیشنهادی:** `q.slice(0, 100)` یا رد صریح با ۴۰۰ اگر طول بیش از یک سقف معقول (مثلاً ۱۰۰ کاراکتر — هیچ عبارت جستجوی واقعی از این بلندتر نیست) باشد.
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** کم؛ چند خط، کمتر از نیم‌روز.
- **تخمین Impact اصلاح:** کم تا متوسط — کاهش هزینهٔ CPU حاشیه‌ای، نه یک آسیب‌پذیری بحرانی.
- **مثال از سایت‌های برتر:** اکثر APIهای جستجوی عمومی (Algolia, Elasticsearch-backed) یک سقف صریح روی طول query دارند (معمولاً ۱۰۰–۲۵۶ کاراکتر) دقیقاً به همین دلیل.
- **Acceptance Criteria:** یک query با طول > ۱۰۰ کاراکتر یا رد شود (۴۰۰) یا truncate شود قبل از رسیدن به لایهٔ DB؛ تست جدید این رفتار را پوشش دهد. **این نوبت رفع نشد** — یافته باز است، عمداً برای اولویت‌بندی مستقل (Low، نه اضطراری).

### H-173 — سقف طول برای تمام stringها — 96/100 (رفع شد این نوبت)

- **وضعیت فعلی (پس از اصلاح):** `contactSchema`, `cooperationSchema`, `requestSchema`, `weightSchema` اکنون هر فیلد متنی را `.max()` می‌کنند (`web/src/lib/validation/schemas.ts`). این هم‌راستا با الگوی همیشگی بقیهٔ اپ شد: `profileSchema.firstName/lastName` (`.max(40)`)، `leadPayload` (هر فیلد، شامل آرایه) در `api.ts:44-63`، `letterheadUpdatePayload` (`.max(80)`/`.max(300)`/`.max(20)`)، `cut-to-size-requests/route.ts:10-16` (هر فیلد `.max()`).
- **مشکل دقیق (پیش از اصلاح):** چهار schema قدیمی‌تر (که مستقیماً توسط `/api/contact` و `/api/cooperation` استفاده می‌شوند — نه صرفاً client-side) فاقد `.max()` بودند: `contactSchema.message` فقط `.min(5)` داشت، بدون سقف بالا؛ `cooperationSchema.company/product/message` بدون سقف. تنها backstop، سقف کلی ۱MB بدنهٔ JSON (`requestBody.ts:43`) بود — یعنی یک کاربر می‌توانست کل بودجهٔ ۱MB را در یک فیلد «پیام» خالی کند.
- **شدت (پیش از اصلاح):** Medium — نه injection، اما مصرف حافظه/ذخیره‌سازی نامتناسب و مقاوم‌سازی ناقص در برابر یک فرم spam ساده.
- **چرا مشکل بود / Impact مالی:** یک پیام تماس ۱MBای در جدول `contact_messages` ذخیره می‌شود، در پنل ادمین رندر می‌شود (صفحه را کند می‌کند) و در بازخوانی/export سنگین است.
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز/ناچیز/ناچیز/کم (فقط تجربهٔ کارشناس پنل).
- **شواهد:** `web/src/lib/validation/schemas.ts` (قبل/بعد در diff این commit)؛ `web/src/lib/validation/schemas.test.ts` (+۷ تست جدید، شامل رد صریح رشتهٔ بیش از سقف).
- **راه‌حل پیاده‌شده:** `name`≤۶۰، `company`≤۱۲۰، `product`≤۲۰۰، `message`≤۲۰۰۰ (contact/cooperation)، `category`/`size`≤۶۰ (weight) — اعداد هم‌مقیاس با سقف‌های مشابه در بقیهٔ اپ (`companyName`≤۸۰ در letterhead، `note`≤۱۰۰۰ در lead).
- **اولویت اجرا:** انجام شد (بود P1).
- **سختی/هزینهٔ اصلاح:** کم؛ کمتر از یک ساعت (شامل تست).
- **تخمین Impact اصلاح:** کم تا متوسط.
- **مثال از سایت‌های برتر:** هر فرم تماس تولیدی (Zendesk, Intercom) یک سقف عملی روی فیلد پیام دارد (معمولاً ۱۰۰۰–۵۰۰۰ کاراکتر).
- **چرا هنوز ۱۰۰ نیست:** بند H-172 (سقف query string) از همین خانواده است و رفع نشد؛ و یک بررسی کامل‌تر روی تمام ۶۷ schema (نه فقط چهار موردی که این نوبت پیدا شد) با یک اسکریپت خودکار (نه grep دستی) انجام نشده — ممکن است schemaهای دیگری با همین الگو جا مانده باشند که این جستجوی دستی ندید.
- **Acceptance Criteria:** `contactSchema.safeParse({message: 'ا'.repeat(2001), ...}).success === false` — **PASS** (تست جدید)؛ همهٔ ۳۳۱۳ تست پروژه سبز.

### H-174 — سقف تعداد عناصر array و عمق JSON — 92/100

- **وضعیت فعلی:** آرایه‌های واقعاً پرخطر سقف‌دار هستند: `leadPayload.items` (`api.ts:59`) `.max(100)`؛ `tenderPricePayload.items` (`api.ts:76`) `.max(100)`. سقف کلی اندازهٔ بدنه (۱MB JSON) به‌صورت backstop عمق/حجم را هم به‌طور غیرمستقیم محدود می‌کند (یک JSON عمیقاً تودرتو در ۱MB عملاً به چند هزار سطح نمی‌رسد چون هر سطح overhead نحوی دارد).
- **مشکل دقیق:** هیچ سقف **صریح روی عمق JSON** (`z.object` تودرتو، یا یک محدودکنندهٔ عمق در سطح parser) وجود ندارد — تنها اتکا به سقف حجم کلی است. برای schemaهایی با فیلد آزاد نسبتاً بزرگ (`seo: seoMetaSchema` در مقالات) عمق schema توسط خودِ Zod (نوع ایستا) محدود است، پس این ریسک عملاً فقط برای یک attacker که سعی کند JSON.parse را با تو‌درتویی مصنوعی کند (V8 stack overflow) مطرح می‌شود — که `JSON.parse` بومی است نه یک parser بازگشتی دستی، و امنیت آن به عهدهٔ Node/V8 است، نه این کد.
- **شدت:** Low.
- **چرا مشکل است / Impact مالی:** ریسک تئوریک DoS از یک بدنهٔ عمیقاً تودرتو (زیر سقف ۱MB) — بدون شاهد واقعی اینکه `JSON.parse` بومی V8 در برابر این آسیب‌پذیر است (اکثر پیاده‌سازی‌های مدرن V8 در برابر این نوع bomb مقاوم‌اند).
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز.
- **شواهد:** `web/src/lib/server/utils/requestBody.ts:43-50` (فقط سقف حجم، نه عمق)؛ `web/src/lib/validation/api.ts:44-77` (سقف array فقط در دو schema پرخطر).
- **راه‌حل پیشنهادی:** فوری نیست؛ اگر یک schema جدید فیلد آرایهٔ آزاد (بدون `.max()`) اضافه شود، همان قاعدهٔ leadPayload را رعایت کند.
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** کم اگر لازم شود.
- **تخمین Impact اصلاح:** کم.
- **مثال از سایت‌های برتر:** Stripe API سقف صریح روی تعداد عناصر آرایه در بسیاری از endpointها دارد (مثلاً حداکثر ۱۰۰ آیتم در یک invoice).
- **Acceptance Criteria:** برآورده برای دو مسیر پرخطر شناخته‌شده (leads, tender)؛ یک قاعدهٔ لینتی/ convention-test برای «هر آرایهٔ ورودی باید `.max()` داشته باشد» وجود ندارد.

### H-175 — رفتار Content-Type اشتباه یا body malformed — 98/100

- **وضعیت فعلی:** `readJsonBody` (`requestBody.ts:43-50`) بدنه را stream می‌کند، `Content-Length` را پیش از تخصیص حافظه چک می‌کند (`readBody:12`)، و اگر واقعی بدنه از سقف (پیش‌فرض ۱MB) عبور کند، `PayloadTooLargeError` می‌اندازد که `withApiErrorHandling` (`apiGuard.ts:31`) و `validateBody` (`request.ts:24-26`) هر دو صراحتاً catch می‌کنند و ۴۱۳ برمی‌گردانند. یک JSON نامعتبر (Content-Type درست یا غلط، فرقی نمی‌کند چون Content-Type اصلاً چک نمی‌شود) باعث `JSON.parse` throw می‌شود که در `try/catch` همان تابع به `null` تبدیل می‌شود (`requestBody.ts:47`) — سپس `schema.safeParse(null)` شکست می‌خورد و یک ۴۰۰ تمیز با پیام فارسی برمی‌گردد، هرگز یک exception خام.
- **مشکل دقیق:** هیچ. رفتار برای هر دو کلاس (malformed JSON، بدنهٔ بیش‌ازحد بزرگ) صراحتاً تست‌پذیر و امن است.
- **شدت:** N/A.
- **شواهد:** `web/src/lib/server/utils/requestBody.ts` (کامل)؛ `web/src/lib/validation/request.ts:17-43`؛ `web/src/lib/server/utils/apiGuard.ts:31`.
- **چرا هنوز ۱۰۰ نیست:** یک تست مستقیم end-to-end («یک body با `Content-Type: text/plain` حاوی JSON نامعتبر به یک route واقعی POST شود و ۴۰۰/۴۱۳ دقیق برگردد») برای این نشست اجرا نشد — فقط کد خوانده شد، نه یک HTTP request واقعی زده شد. منطق مستقیماً از کد قابل استنتاج است اما «اجرا شد و PASS داد» با «کد درست به‌نظر می‌رسد» یکی نیست.
- **راه‌حل پیشنهادی:** ندارد فوری؛ فقط یک تست e2e سبک برای مستندسازی رفتار (نه تغییر کد) ارزش افزوده دارد.
- **اولویت اجرا:** N/A.
- **سختی/هزینهٔ اصلاح:** N/A.
- **مثال از سایت‌های برتر:** [Stripe API error handling](https://docs.stripe.com/api/errors) — همیشه یک JSON envelope، هرگز crash خام.
- **Acceptance Criteria:** یک درخواست POST با بدنهٔ `"{not json"` به هر route با `validateBody` باید ۴۰۰ با `{error:'validation', fields}` برگرداند، نه ۵۰۰. برآورده در سطح کد؛ اجرای HTTP زندهٔ این نوبت انجام نشد.

### H-176 — جلوگیری از mass assignment در profile، lead، order و catalog — 94/100

- **وضعیت فعلی:** هر سه مسیر نمونه‌برداری‌شده مقاوم است:
  - `PUT /api/me/profile` (`route.ts:14-36`): `profileUpdatePayload` فقط `firstName`/`lastName` می‌پذیرد؛ `updateUser` با یک object صریح (نه spread بدنه) صدا زده می‌شود — نمی‌توان `role`/`isActive` را از این مسیر تغییر داد.
  - `PATCH /api/admin/orders/[ref]` (`route.ts:6-11`): schema صریح فقط `status`(enum بسته)/`trackingNumber`/`carrierName`/`note` — بدون `userId`/`price`/`total`.
  - `POST /api/leads` (`leadPayload`, `api.ts:44-63`): بدون فیلد `status`/`userId`؛ `quotedUnitPrice` صراحتاً در کامنت «مقایسه‌ای، هرگز برای قیمت‌گذاری» علامت خورده — یعنی حتی اگر مقدار دستکاری شود، فقط برای نمایش مقایسه‌ای است نه محاسبهٔ نهایی (که سرور مستقل انجام می‌دهد).
  - `search`ی گسترده برای `Object.assign(`/`...req.body`/`...body` در کل `src/app/api` و `src/lib/server`: تنها یک نتیجه (`ai/pipeline.ts:342`)، روی دادهٔ داخلی pipeline هوش مصنوعی (نه ورودی خام کاربر).
  - هیچ `.passthrough()`/`z.any()`/`z.record()` در کل `src/lib/validation` (grep صفر نتیجه) — یعنی Zod ساختاری کلید اضافه را رد می‌کند، نه فقط با قرارداد.
- **مشکل دقیق:** نمونه‌برداری بود، نه بررسی کامل ۶۷ مسیر دارای body. سه مسیر پرخطر (profile، سفارش، lead) تأیید شد؛ باقی مسیرهای admin catalog/warehouse به‌صورت فردی خوانده نشدند.
- **شدت:** Low (به دلیل شواهد ساختاری قوی — نبود passthrough/spread در کل کد — نه فقط سه نمونه).
- **شواهد:** فایل‌های ذکرشده بالا؛ `grep -rn "Object.assign(\|\.\.\.req\.body\|\.\.\.body\b"` روی کل `src/app/api` و `src/lib/server`.
- **راه‌حل پیشنهادی:** یک بررسی خودکار CI (مثل G's `adminApiConventions.test.ts`) که مطمئن شود هیچ route جدید `.passthrough()`/`z.any()`/`z.record()`/spread خام اضافه نمی‌کند.
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** کم؛ یک تست lint-مانند، کمتر از نیم‌روز.
- **تخمین Impact اصلاح:** کم (ریسک فعلی هم کم است؛ این یک نگهبان آینده است، نه رفع یک باگ امروز).
- **مثال از سایت‌های برتر:** Rails' Strong Parameters و NestJS's `ValidationPipe({whitelist:true, forbidNonWhitelisted:true})` دقیقاً همین قاعده را به‌صورت framework-level enforce می‌کنند؛ این اپ همان نتیجه را با انضباط دستی (بدون passthrough) گرفته، بدون enforcement خودکار.
- **Acceptance Criteria:** یک تست ثابت کند صفر فایل در `src/lib/validation` از `.passthrough()`/`z.any()`/`z.record()` استفاده می‌کند — امروز به‌صورت grep دستی برآورده، نه CI-enforced.

### H-177 — جلوگیری از SQL injection در search، sort، filter و export — 97/100

- **وضعیت فعلی:** تمام کوئری‌ها از Drizzle ORM با `sql\`...${value}...\`` (پارامتری‌شده، نه string concatenation) یا هلپرهای typed (`ilike`, `eq`, `and`) استفاده می‌کنند. تنها استفاده از `sql.raw()` (که رشتهٔ خام را بدون escape درج می‌کند) در `analyticsRepo.ts:175-191` است، برای نام جدول/ستون پویا در KPI dashboard — و این با یک **union type بسته** (`KPI_SOURCES`, پنج کلید ثابت: `leads`/`orders`/`users`/`ai_conversations`/`proformas`) قفل شده: امضای تابع اجازهٔ رسیدن هیچ `string` دلخواه (چه برسد به ورودی کاربر) به `sql.raw` را نمی‌دهد — کامنت کد صراحتاً این را به‌عنوان یک closure از یک آسیب‌پذیری قبلی («یک امضای قدیمی `extraWhere` آزاد پذیرفته می‌شد») مستند کرده. دو مورد دیگر `sql.raw()` (`cleanup.job.ts:19,22`) روی رشته‌های ثابت هاردکد («۱۵»، «interval '15 minutes'») هستند، نه ورودی.
- **مشکل دقیق:** ندارد در سطحی که بررسی شد. جستجوی کامل `sql.raw(` در `src/lib/server` (نه نمونه) دقیقاً ۴ فراخوانی پیدا کرد؛ همه بررسی و امن تأیید شدند.
- **شدت:** N/A.
- **شواهد:** `web/src/lib/server/repos/analyticsRepo.ts:139-195` (کامنت + کد)؛ `web/src/lib/server/jobs/cleanup.job.ts:19,22`.
- **چرا هنوز ۱۰۰ نیست:** بررسی روی `grep`، نه یک ابزار static-analysis اختصاصی SQLi (مثل semgrep با قوانین injection) — این نشست semgrep در دسترس نبود (خطای اتصال ابزار، نه نبود پیکربندی). یک اسکن ابزاری مستقل می‌تواند الگویی را که grep دستی از قلم انداخته پیدا کند.
- **راه‌حل پیشنهادی:** وقتی semgrep در دسترس بود، یک اسکن با rule set امنیتی رسمی (`p/sql-injection`) اجرا و نتیجه ضمیمه شود.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** کم (فقط اجرای ابزار).
- **تخمین Impact اصلاح:** کم — شواهد فعلی از قبل قوی است؛ این فقط یک لایهٔ تأیید اضافه است.
- **مثال از سایت‌های برتر:** هر تیم امنیتی بالغ (Stripe, GitHub) یک semgrep/CodeQL rule اختصاصی برای `sql.raw`/string-built query دارد که در CI هر PR را چک می‌کند؛ این مخزن این automation را ندارد (فقط انضباط دستی).
- **Acceptance Criteria:** صفر فراخوانی `sql.raw()` با یک متغیر غیر-ثابت به‌جز پنج کلید `KPI_SOURCES` — برآورده با بررسی دستی این نوبت؛ CI-enforced نیست.

### H-178 — escape صحیح wildcardهای % و _ در جستجوی SQL — 97/100

- **وضعیت فعلی:** `web/src/lib/server/utils/likeEscape.ts` یک تابع مرکزی (`escapeLike`/`likeContains`/`likeContainsDigitVariants`) دارد که `\`, `%`, `_` را escape می‌کند (backslash اول، در یک single-pass character class — کامنت کد صراحتاً توضیح می‌دهد چرا سه `.replace()` جداگانه اشتباه بود). هر ۷ فایل repo که `ilike(` صدا می‌زنند (`ordersRepo.ts`, `catalogRepo.ts`, `leadsRepo.ts`, `catalogAdminRepo.ts`, `alertsRepo.ts`, `aiCorrectionsRepo.ts`, `articlesRepo.ts`) از این هلپر عبور می‌کنند — `grep -rn "ilike(.*\`%"` (جستجوی مستقیم برای الگوی خام escapeنشده) روی کل `src/lib/server` **صفر نتیجه** داد.
- **مشکل دقیق:** ندارد. کامنت خودِ `likeEscape.ts` این را به‌عنوان یک باگ واقعیِ قبلاً-کشف‌شده مستند می‌کند («جستجوی «40_40» با «40x40» مچ می‌شد؛ یک `%` تنها کل جدول را برمی‌گرداند») — یعنی این دقیقاً همان چیزی است که بند ۱۷۸ می‌پرسد، و قبلاً به‌طور مستقل پیدا و رفع شده بود.
- **شدت:** N/A.
- **شواهد:** `web/src/lib/server/utils/likeEscape.ts` (کامل، با تحلیل تهدید در کامنت)؛ صفر نتیجهٔ grep برای الگوی escape‌نشده.
- **چرا هنوز ۱۰۰ نیست:** پوشش «هر call site» با grep تأیید شد، اما یک تست CI که این ادعا را برای هر PR **آینده** enforce کند (مثل G's الگوی `adminApiConventions.test.ts`) وجود ندارد — یک fix آینده که ILIKE جدیدی اضافه کند و escapeLike را فراموش کند، هیچ چیز آن را نمی‌گیرد جز یک آدیت دستی دیگر.
- **راه‌حل پیشنهادی:** یک تست ESLint rule سفارشی یا یک تست ساده («هر فراخوانی `ilike(` باید آرگومان دومش از `likeContains`/`likeContainsDigitVariants` بیاید») اضافه شود.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** متوسط (یک ESLint rule سفارشی، یا یک تست AST-based؛ ۱ نفرروز).
- **تخمین Impact اصلاح:** کم — ریسک فعلی صفر است؛ این فقط از رگرسیون آینده محافظت می‌کند.
- **مثال از سایت‌های برتر:** [OWASP SQL Injection Prevention Cheat Sheet — LIKE clause escaping](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) دقیقاً همین الگو را توصیه می‌کند.
- **Acceptance Criteria:** جستجوی یک رشتهٔ حاوی `%`/`_` باید نتیجهٔ literal بدهد نه wildcard-expanded — رفتار کد این را تضمین می‌کند؛ تستی که این را روی یک دیتابیس واقعی (نه فقط unit روی تابع escape) اثبات کند در این نوبت اجرا نشد.

### H-179 — جلوگیری از IDOR در تمام مسیرهای [id] و [ref] — 90/100

- **وضعیت فعلی:** دو الگوی متفاوت و هردو آگاهانه:
  1. **مسیرهای session-scoped** (`/api/me/**`): مالکیت یا با یک helper صریح (`owned()` در `me/alerts/[id]/route.ts:17-26` — می‌خواند و `alert.userId !== session.id` را چک می‌کند، قبل از هر mutation) یا با scoping درون خودِ کوئری repo (`removeFavorite(session.id, skuId)` در `me/favorites/[skuId]/route.ts:12`) اجرا می‌شود.
  2. **مسیرهای capability-by-ref عمومی** (`/api/track/[ref]`, `/api/proforma/[ref]`): این‌ها **عمداً** بدون session کار می‌کنند — ref خودش کلید دسترسی است، نه یک شناسهٔ ترتیبی. آنتروپی واقعی بررسی شد: `refs.ts:22` یک الفبای ۳۰-نمادی base32 برای پسوند ۶-کاراکتری استفاده می‌کند (~۲۹.۴ بیت، کامنت کد می‌گوید «هرگز به زیر این کم نشود»)، به‌علاوهٔ rate limit (`track`: ۳۰/دقیقه، `proforma`: ۲۰/دقیقه). حدس‌زدن یک ref با یک IP در این نرخ ~۸۹ سال طول می‌کشد؛ محافظت واقعی، نه صرفاً «مبهم‌سازی».
- **مشکل دقیق:** آنتروپی ref فرض‌شدهٔ کد (۲۹.۴ بیت) در این نشست **دوباره محاسبه** شد (نه فقط از کامنت کد گرفته شد) و درست بود، اما فرض «یک IP» پشت rate limit به یک بات‌نت با هزاران IP معنا ندارد — با ۱۰۰۰۰ IP موازی (هرکدام ۳۰ درخواست/دقیقه)، کل فضای ۹۴۰ میلیونی در چند ساعت قابل جاروب است. این یک محدودیت شناخته‌شدهٔ per-IP rate limiting است، نه یک باگ خاص این کد.
- **شدت:** Low (نیازمند یک بات‌نت واقعی با هزاران IP فقط برای خواندن یک پیش‌فاکتور/سفارش — هزینهٔ حمله به‌مراتب بیش از ارزش هدف).
- **چرا مشکل است / Impact مالی:** اگر رخ دهد، افشای اطلاعات یک سفارش/پیش‌فاکتور به شخص ثالث (نه تغییر، چون این مسیرها فقط GET هستند).
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز/ناچیز/ناچیز/ناچیز.
- **شواهد:** `web/src/lib/server/utils/refs.ts` (کامل، تحلیل آنتروپی در کامنت)؛ `web/src/app/api/track/[ref]/route.ts:10`؛ `web/src/app/api/proforma/[ref]/route.ts:13`.
- **راه‌حل پیشنهادی:** فوری نیست. اگر نگرانی جدی شود، یک rate limit سراسری (نه فقط per-IP) روی این دو scope در سطح Cloudflare (WAF rule) اضافه شود — خارج از این مخزن.
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** متوسط (نیازمند تنظیم Cloudflare، نه فقط کد).
- **تخمین Impact اصلاح:** کم (سناریوی حمله بعید و پرهزینه است).
- **مثال از سایت‌های برتر:** Stripe's payment link / invoice URLs از همین الگوی «بلندطول تصادفی + بدون session» استفاده می‌کنند؛ Stripe هم به rate limit تنها اتکا نمی‌کند بلکه طول توکن را (۲۴+ کاراکتر تصادفی) بسیار بالاتر از این نگه می‌دارد.
- **Acceptance Criteria:** برای مسیرهای session-scoped: یک تلاش برای دسترسی به منبع کاربر دیگر باید ۴۰۴ برگرداند — تست موجود برای `me/alerts` (`owned()` helper) این را پوشش می‌دهد؛ برای بقیهٔ `/api/me/**` بررسی کامل انجام نشد (نمونه‌برداری). برای مسیرهای capability: آنتروپی و rate limit تأیید شد؛ حملهٔ توزیع‌شدهٔ واقعی آزموده نشد.
- **تصحیح این نوبت (نمونهٔ دقیق قاعدهٔ اول این آدیت):** یک inventory جداگانهٔ کامل ۱۵۴ route (اجراشده به‌صورت مستقل، خارج از نوشتار اصلی این سند) ادعا کرد `POST /api/admin/leads/[id]/order` و `PATCH /api/admin/orders/[ref]` فاقد چک مالکیت (assignee) هستند — یعنی هر کارمند با `leads:write` می‌تواند سرنخ/سفارش کارمند دیگر را تغییر دهد. این ادعا با خواندن مستقیم `ordersRepo.ts` **رد شد**: `createOrder` (`ordersRepo.ts:193-194`) و `mutateOrder` (`ordersRepo.ts:246-249`) هردو همان `canActOnAssignedRecord(actor, lead.assigneeId)` را **درون تراکنش، یک لایه پایین‌تر از route** اجرا می‌کنند و `BusinessRuleError('lead_forbidden'/'order_forbidden', ..., 403)` می‌اندازند — دقیقاً همان الگویی که در `me/warehouse/operations` تأیید شده بود. یک اصلاح route-level ابتدا اعمال و سپس، پس از کشف این redundancy، **برگردانده شد** (کد قبل از این نوبت commit نشده بود، پس هیچ diffی باقی نماند) — افزودن یک چک تکراری در route با یک پیام خطای کمی متفاوت از همان چک repo-level، دقیقاً «اصلاح یک باگ غیرواقعی» بود که این آدیت را در تضاد با قانون اولش قرار می‌داد. این تناقض بین دو ادعای همین نشست خودش شاهدی است برای چرا «هرگز بدون شواهد مستقیم تأیید نکن» — هم برای ادعای اولیهٔ inventory، هم برای اصلاح عجولانهٔ من صادق بود.

### H-180 — جلوگیری از stored و reflected XSS در مقاله، نظر، نام شرکت و note — 96/100

- **وضعیت فعلی:** معماری این اپ اصلاً به «sanitize کردن HTML» متکی نیست — چون **هیچ HTML خامی هرگز رندر نمی‌شود**. مقالات به‌صورت یک سند JSON ساختاریافته (`RichDoc`) ذخیره می‌شوند، نه HTML؛ `RichContent.tsx` (کامنت خط ۴: «THIS IS THE ONLY RENDERER... imports nothing from Tiptap or ProseMirror») هر نوع node را جداگانه به یک عنصر React نگاشت می‌کند (`<strong>`, `<em>`, `<a>`, ...) — متن همیشه از طریق فرزند React رندر می‌شود (auto-escape ذاتی JSX)، هرگز `dangerouslySetInnerHTML`. جستجوی کامل `dangerouslySetInnerHTML` در کل `src` دقیقاً ۲ نتیجه داد: `ChatMarkdown.tsx` (پاسخ AI — grounded، نه ورودی مستقیم کاربر) و `JsonLd.tsx` (structured data، JSON.stringify-شده).
- **مشکل دقیق:** نظرات مقاله (`article_comments`) و «نام شرکت» (`companyName` در لیدها/همکاری) بررسی نشد که آیا از همین `RichContent` رندر می‌شوند یا یک مسیر متفاوت (احتمالاً متن ساده) دارند — این نمونه‌برداری روی «مقاله» عمیق بود، روی «نظر» و «نام شرکت» فقط از طریق schema (متن ساده، بدون قالب‌بندی) استنتاج شد، نه با خواندن کامپوننت رندر آن‌ها.
- **شدت:** Low (به دلیل معماری ساختاری امن مقالات؛ ریسک باقی‌مانده فقط برای دو مسیر بررسی‌نشده).
- **شواهد:** `web/src/components/content/RichContent.tsx:1-62`؛ `web/src/components/content/ArticleBody.tsx`؛ grep کامل `dangerouslySetInnerHTML`.
- **راه‌حل پیشنهادی:** یک بررسی مستقیم کامپوننت رندر نظرات (`ArticleComments` یا مشابه) برای تأیید همان الگوی متن-ساده/بدون HTML.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** کم (فقط بررسی، احتمالاً بدون نیاز به تغییر).
- **تخمین Impact اصلاح:** کم.
- **مثال از سایت‌های برتر:** این الگو (رندر ساختاریافته به‌جای HTML خام) دقیقاً همان چیزی است که Contentful/Sanity (headless CMSهای مدرن) با «rich text as JSON, not HTML» به‌عنوان best practice توصیه می‌کنند — قوی‌تر از «HTML را sanitize کن».
- **Acceptance Criteria:** یک تلاش برای ذخیرهٔ `<script>alert(1)</script>` در فیلد نظر/نام‌شرکت باید هنگام رندر به‌صورت متن حرف‌به‌حرف (نه اجرا) نمایش داده شود. برای مقاله تأیید شد (معماری React)؛ برای نظر/نام‌شرکت آزموده نشد.

### H-181 — sanitize امن HTML تولیدشده توسط TipTap — 96/100

- **وضعیت فعلی:** TipTap **فقط** در ادیتور ادمین (`src/components/admin/content/editor/`) استفاده می‌شود — یعنی فقط کارمندان (staff) با نقش مربوطه محتوا تولید می‌کنند، نه هر کاربر عمومی. خروجی TipTap قبل از ذخیره به `RichDoc` (JSON ساختاریافته) تبدیل می‌شود، نه به‌عنوان رشتهٔ HTML ذخیره می‌شود — پس «sanitize HTML» به معنای سنتی (یک کتابخانه مثل DOMPurify/sanitize-html) لازم نیست چون HTML خامی که نیاز به sanitize داشته باشد اصلاً در مسیر ذخیره‌سازی/رندر وجود ندارد. `package.json` هیچ‌کدام از `sanitize-html`/`dompurify`/`rehype-sanitize` را ندارد — این یک انتخاب معماری آگاهانه است (رندر ساختاریافته)، نه یک وابستگی فراموش‌شده. `ArticleImage.ts` (تیپتپ extension) خودش `allowBase64: false` تنظیم می‌کند — یعنی حتی در سطح ادیتور، یک `data:` URI مستقیم قابل چسباندن به‌عنوان تصویر نیست (باید از upload endpoint با magic-byte sniffing عبور کند).
- **مشکل دقیق (بسته شد این نوبت با خواندن مستقیم):** `richDoc.ts:186-208` (`normalizeImageSrc`) دقیقاً همان الگوی `safeHref` را برای src تصویر اجرا می‌کند — فقط `http:`/`https:` بعد از resolve واقعی پذیرفته می‌شود (`u.protocol !== 'http:' && u.protocol !== 'https:'` رد می‌کند)، و همین تابع در schema اعتبارسنجی ImageNode مستقیم صدا زده می‌شود (`richDoc.ts:265`) — یعنی حتی اگر یک حساب content:write بخواهد `javascript:`/`data:` را به‌عنوان src تصویر ذخیره کند، در لحظهٔ ذخیره (نه فقط رندر) رد می‌شود؛ این ادعا این نوبت با خواندن کامل هردو تابع (نه فقط دیدن نام فایل، مثل نوبت قبلی همین سند) تأیید شد.
- **شدت:** Low.
- **چرا مشکل است / Impact مالی:** ناچیز — دو لایهٔ مستقل (ادیتور: `allowBase64:false`؛ schema ذخیره: `normalizeImageSrc`) هردو تأیید شدند.
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز.
- **شواهد:** `web/src/lib/content/richDoc.ts:139-163` (`safeHref`)، `:186-208` (`normalizeImageSrc`)، `:265` (call site در schema)؛ `web/src/components/admin/content/editor/extensions/ArticleImage.ts:1-60` (کامل، `allowBase64: false`).
- **راه‌حل پیشنهادی:** ندارد.
- **اولویت اجرا:** N/A.
- **سختی/هزینهٔ اصلاح:** انجام شد (فقط تأیید).
- **تخمین Impact اصلاح:** N/A.
- **مثال از سایت‌های برتر:** Notion/Linear هم محتوای rich-text خود را به‌عنوان JSON ساختاریافته ذخیره می‌کنند، نه HTML — همین دلیل معماری.
- **چرا هنوز ۱۰۰ نیست:** یک تست خودکار مستقیم (`normalizeImageSrc('javascript:alert(1)') === null`) در این نوبت نوشته/اجرا نشد — فقط منطق کد مستقیماً خوانده و تأیید شد؛ `ImageNodeView.tsx` (رندر تعاملی در خودِ ادیتور، نه مسیر ذخیره/رندر نهایی) هم‌چنان خوانده نشد.
- **Acceptance Criteria:** `normalizeImageSrc('javascript:alert(1)')`, `normalizeImageSrc('data:text/html,...')` باید `null` برگردانند — منطق کد این را تضمین می‌کند (تأیید با خواندن مستقیم این نوبت)؛ تست خودکار مستقیم نوشته نشد.

### H-182 — جلوگیری از javascript URL و event handler در محتوای مقاله — 95/100

- **وضعیت فعلی:** `safeHref` (`richDoc.ts:139-163`) یک **allowlist صریح پروتکل** است، نه یک blacklist: فقط `#fragment`, `mailto:`, `tel:`, و URLهای `http/https` (مطلق یا site-relative، با resolve واقعی و بررسی مجدد پروتکل بعد از resolve) پذیرفته می‌شوند؛ هر چیز دیگر (شامل `javascript:`, `data:`, `vbscript:`) رد می‌شود چون نه با `#`/`mailto:`/`tel:` شروع می‌شود، نه `http(s)`/`/ ` است. `URL_CONFUSABLES` یک کلاس جداگانهٔ حملهٔ parser-confusion (که کامنت می‌گوید قبلاً واقعی بوده: «`/\evil.com/x.png` قبلاً به‌عنوان site-relative ذخیره می‌شد») را هم می‌بندد.
- **event handler** (`onerror`, `onclick`, ...): چون هیچ HTML خامی رندر نمی‌شود (H-180/181)، مفهوم «attribute تزریق‌شده» اصلاً در سطح رندر مطرح نیست — `RichContent.tsx` هیچ attribute دلخواهی از سند را مستقیم به DOM منتقل نمی‌کند؛ فقط `href`/`src` که هردو از `safeHref`/معادل تصویر عبور می‌کنند.
- **مشکل دقیق:** ندارد در مسیر رندر نهایی. جنبهٔ ورودی (آیا خودِ TipTap ادیتور اجازهٔ تایپ `javascript:` در فیلد لینک را می‌دهد) در H-181 به‌عنوان یک شکاف کوچک بررسی‌نشده ثبت شد — چون حتی اگر ادیتور اجازه دهد، ذخیره/رندر نهایی رد می‌کند؛ پس این یک مشکل UX (کارمند فکر می‌کند لینکش کار می‌کند ولی نه) است، نه امنیتی.
- **شدت:** N/A (مسیر رندر نهایی).
- **شواهد:** `web/src/lib/content/richDoc.ts:139-190` (کامل).
- **چرا هنوز ۱۰۰ نیست:** تست خودکار مستقیم (`richDoc.test.ts` یا مشابه) که `safeHref('javascript:alert(1)')` را صریح assert کند، در این نوبت پیدا/اجرا نشد — فقط منطق کد خوانده شد؛ اگر چنین تستی از قبل وجود دارد، این نوبت آن را ندید (زمان کافی برای جستجوی فایل تست نبود).
- **راه‌حل پیشنهادی:** ندارد فوری اگر تست از قبل هست؛ اگر نیست، اضافه شود.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** کم.
- **تخمین Impact اصلاح:** کم.
- **مثال از سایت‌های برتر:** [OWASP XSS Prevention — URL scheme allowlisting](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) دقیقاً همین رویکرد (allowlist نه blacklist) را توصیه می‌کند.
- **Acceptance Criteria:** `safeHref('javascript:alert(1)')`, `safeHref('data:text/html,...')`, `safeHref('  javascript:alert(1)')` (با فاصلهٔ پیشوندی) همه باید `null` برگردانند — منطق کد این را تضمین می‌کند (چون هیچ‌کدام با `#`/`mailto:`/`tel:`/`http(s):`/`/ ` شروع نمی‌شوند)؛ تأیید با تست خودکار مستقیم این نوبت انجام نشد.

### H-183 — محافظت در برابر prototype pollution در payloadهای آزاد — 94/100

- **وضعیت فعلی:** هیچ فیلد «آزاد» واقعی (بدون schema بسته) در ورودی‌های کاربر پیدا نشد. جستجوی کامل `.passthrough()`, `z.any()`, `z.record(` در کل `src/lib/validation` **صفر نتیجه** داد. `seo`/`translations` (فیلدهایی که در درخواست اولیهٔ این بند به‌عنوان «آزاد» فرض شده بودند) هردو schemaهای Zod نام‌گذاری‌شدهٔ صریح دارند (`seoMetaSchema` در `admin/articles/route.ts:55` و `[id]/route.ts:105`)، نه یک object باز. جستجوی `Object.assign(`/spread خام روی `req.body` در کل `src/app/api` و `src/lib/server` تنها یک نتیجهٔ بی‌ربط داد (`ai/pipeline.ts:342`، merge دادهٔ داخلی pipeline، نه ورودی کاربر).
- **مشکل دقیق:** ندارد در سطح بررسی‌شده. چون Zod's `.parse()`/`.safeParse()` همیشه یک object **جدید** با فقط کلیدهای تعریف‌شده در schema برمی‌گرداند (نه یک reference به ورودی خام)، حتی اگر کسی سعی کند `__proto__`/`constructor`/`prototype` را در بدنهٔ JSON بفرستد، آن کلید هرگز از لایهٔ validation عبور نمی‌کند مگر schema صریحاً آن نام را تعریف کرده باشد (که هیچ‌کدام نکرده‌اند).
- **شدت:** N/A.
- **شواهد:** grep کامل روی سه الگو (`.passthrough()`, `z.any()`, `z.record(`) در `src/lib/validation`؛ grep کامل `Object.assign(`/spread در `src/app/api` + `src/lib/server`.
- **چرا هنوز ۱۰۰ نیست:** یک تست مستقیم («یک بدنهٔ JSON با کلید `__proto__` به هر route POST شود و `Object.prototype` دست‌نخورده بماند») در این نوبت **اجرا نشد** — فقط استدلال ساختاری (Zod همیشه object تازه می‌سازد) ارائه شد، نه یک اثبات تجربی زنده.
- **راه‌حل پیشنهادی:** یک تست ساده در `request.test.ts`: بدنهٔ `{"__proto__": {"polluted": true}}` را از طریق `validateBody` رد کنید و `({}).polluted === undefined` را assert کنید.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** بسیار کم (یک تست، کمتر از یک ساعت).
- **تخمین Impact اصلاح:** ناچیز (شواهد ساختاری از قبل قوی است).
- **مثال از سایت‌های برتر:** [Snyk — Prototype Pollution guidance](https://snyk.io/blog/preventing-prototype-pollution-nodejs/) توصیه می‌کند از parserهایی استفاده شود که به‌طور ذاتی `__proto__` را به‌عنوان یک کلید معمولی رفتار می‌کنند (نه merge بازگشتی دستی) — دقیقاً رفتار پیش‌فرض `JSON.parse` + Zod در این کد.
- **Acceptance Criteria:** تست فوق نوشته و PASS شود — این نوبت نوشته نشد.

### H-184 — محدودیت اندازهٔ request در Caddy و مجدداً در اپلیکیشن — 93/100

- **وضعیت فعلی:** دو لایه، هردو واقعی: (۱) Caddy — طبق docs/PRODUCTION-AUDIT.md's «Fixed and shipped» («Caddy: edge HSTS backstop, 20 MB request-body cap») یک سقف ۲۰MB در لبه دارد؛ Caddyfile مستقیم در این نشست خوانده نشد (فایل در repo موجود است اما بازخوانی آن برای تأیید عدد دقیق در این turn انجام نشد — اتکا به مستندسازی قبلی). (۲) اپلیکیشن — `readJsonBody` پیش‌فرض ۱MB (`requestBody.ts:43`)، `readFormBody` (آپلود) ۶MB (`requestBody.ts:55`) — **سخت‌گیرتر** از سقف لبه، یعنی لایهٔ اپ واقعاً محدودکننده است، نه صرفاً یک backstop تزئینی.
- **مشکل دقیق:** عدد دقیق سقف Caddy در همین نشست از خودِ Caddyfile بازخوانی/تأیید نشد (فقط از مستندات قبلی نقل شد) — طبق قاعدهٔ خودِ این آدیت («هیچ ادعایی را بدون شاهد مستقیم نپذیر»)، این یک نقص شواهدی است، نه لزوماً یک باگ واقعی.
- **شدت:** Low (شکاف شواهدی، نه شکاف امنیتی محتمل).
- **چرا مشکل است / Impact مالی:** اگر سقف Caddy واقعاً کمتر از فرض ۲۰MB باشد (یا کلاً حذف شده باشد)، ریسکی وجود ندارد چون سقف اپ (۱MB/۶MB) به‌مراتب سخت‌گیرتر است و اول اجرا می‌شود؛ اگر سقف Caddy بیشتر باشد، بازهم اپ محافظت می‌کند. عملاً بی‌تأثیر روی امنیت، فقط روی دقت این سند.
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز.
- **شواهد:** `docs/PRODUCTION-AUDIT.md` (نقل قول، نه بازخوانی مستقیم این نوبت)؛ `web/src/lib/server/utils/requestBody.ts:43,55` (بازخوانی مستقیم این نوبت).
- **راه‌حل پیشنهادی:** بازخوانی مستقیم `Caddyfile` و تأیید مقدار `request_body` یا هر directive مشابه در نوبت بعد.
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** بسیار کم (یک `cat Caddyfile`).
- **تخمین Impact اصلاح:** ناچیز — فقط دقت مستندسازی.
- **مثال از سایت‌های برتر:** الگوی «دو لایه، لایهٔ داخلی سخت‌گیرتر» دقیقاً همان چیزی است که [nginx `client_max_body_size` + app-level validation](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size) به‌صورت استاندارد توصیه می‌شود.
- **Acceptance Criteria:** `grep -i "request_body\|max_size" Caddyfile` باید یک عدد مشخص و منطقی (نزدیک ۲۰MB طبق ادعای قبلی) نشان دهد — این نوبت اجرا نشد.

### H-185 — rate limit جداگانه برای auth، AI، search، comment، contact و lead — 74/100

- **وضعیت فعلی (پس از اصلاح این نوبت):** پوشش برای هر دستهٔ ذکرشده در متن درخواست واقعاً جدا و منطقی است:
  - **auth:** `otp-request` (۸/۵دقیقه)، `otp-verify` (۲۰/۵دقیقه) — هردو جدا؛ به‌علاوهٔ کنترل‌های DB-backed مستقل (F audit) روی همان مسیرها. این نوبت `auth-refresh` (۶۰/دقیقه) به `/api/auth/refresh` و `/api/auth/silent` اضافه شد (قبلاً هیچ نداشتند).
  - **AI:** `ai-chat` (۱۰/۵دقیقه)، `ai-feedback` (۳۰/۵دقیقه)، `ai-lead-draft` (۴۰/۵دقیقه)، `ai-lead-confirm` (۱۰/ساعت) — چهار scope جدا، منطقی متناسب با هزینهٔ هرکدام.
  - **search:** `search` (۳۰/دقیقه، عمومی)، `admin-search` (۶۰/دقیقه، پنل) — جدا از هم.
  - **comment:** `comments` (۵/۱۰دقیقه، ایجاد نظر)، `comment-helpful` (۳۰/دقیقه، رأی مفید) — جدا.
  - **contact:** `contact` (۵/دقیقه پیش‌فرض ۶۰ثانیه — کد `{limit:5}` بدون windowMs یعنی پیش‌فرض تابع، که باید در `rateLimit.ts` بررسی شود).
  - **lead:** `leads` (۱۰/دقیقه پیش‌فرض).
- **مشکل دقیق (باقی‌مانده):** **صفر از ۹۴ مسیر `/api/admin/**` دارای rate limit اختصاصی است** (شمارش دقیق این نوبت، نه تخمین — `grep` برای `rateLimit(req` روی هر فایل admin صفر نتیجه به‌جز `admin/search` و `admin/seo/search-console/metrics` و `admin/upload` داد؛ یعنی ۹۱ از ۹۴ مسیر admin هیچ throttle مستقلی ندارند). این شامل مسیرهای هزینه‌بر مثل `admin/audit/export`, `admin/leads/export`, `admin/pricing/sync`, `admin/warehouse/settlements` (POST، عملیات مالی) می‌شود. تنها محافظت، نیاز به session معتبر + permission است — یعنی یک حساب staff (حتی با دسترسی محدود، نه لزوماً admin کامل) که compromise یا rogue شود می‌تواند این مسیرها را بدون هیچ throttle مکانیکی hammer کند.
- **شدت:** High **برای این زیرمجموعه خاص** (نه برای کل بند — بقیهٔ دسته‌بندی‌های خواسته‌شده پوشش کامل دارند)، چون یک single compromised staff token می‌تواند مستقیم به عملیات مالی/صادرات داده برسد بدون سقف نرخ.
- **چرا مشکل است / Impact مالی:** یک توکن staff افشاشده (نه لزوماً admin) می‌تواند صدها بار در ثانیه `admin/pricing/sync` (که به BrsAPI واقعی متصل می‌شود) یا `admin/leads/export` (کوئری سنگین DB) را صدا بزند — هزینهٔ CPU/DB و پتانسیل rate-limit شدن توسط BrsAPI خودش (که ممکن است دسترسی legitimate را هم قطع کند).
- **تأثیر Revenue/Conversion/SEO/UX:** متوسط/متوسط/ناچیز/پایین (فقط در سناریوی حسابِ staff دزدیده‌شده، نه در کاربرد عادی).
- **شواهد:** شمارش کامل این نوبت: `for f in $(find src/app/api/admin -name route.ts); do grep -q "rateLimit(req" "$f" || echo "$f"; done` → ۹۱ خط خروجی.
- **راه‌حل پیشنهادی:** به‌جای افزودن ۹۱ فراخوانی جداگانه (ریسک بالای خطای کپی-پیست و ناهماهنگی عدد)، یک rate limit **پیش‌فرض سطح wrapper** در `requireApiPermission` (`apiGuard.ts`) اضافه شود — مثلاً یک سقف سخاوتمندانهٔ مشترک (۱۲۰/دقیقه) برای هر درخواست authenticated admin، با امکان override برای مسیرهای خاص که به سقف پایین‌تر نیاز دارند (export، sync). این یک تغییر ساختاری در یک فایل مرکزی است، نه ۹۱ فایل.
- **اولویت اجرا:** P1 (برای مسیرهای export/sync/مالی حداقل؛ نه فوراً بحرانی چون نیازمند یک حسابِ staff از قبل compromise‌شده است — پیش‌نیاز خودش یک لایهٔ دفاعی دیگر (G audit) است).
- **سختی/هزینهٔ اصلاح:** متوسط؛ ۲-۳ نفرروز (طراحی wrapper مشترک + تست روی حداقل چند مسیر نماینده + بدون شکستن مسیرهایی که rate limit خاص خودشان را دارند).
- **تخمین Impact اصلاح:** بالا برای سناریوی «حساب staff دزدیده‌شده» (که طبق F/G audit، ریسک واقعی و نه فرضی محض ثبت شده)؛ صفر برای کاربرد عادی چون سقف سخاوتمندانه است.
- **مثال از سایت‌های برتر:** GitHub API یک rate limit پیش‌فرض روی **هر** endpoint authenticated دارد (۵۰۰۰/ساعت برای token عادی)، صرف‌نظر از حساسیت خاص endpoint — دقیقاً همان الگوی «پیش‌فرض سطح-wrapper، نه per-route دستی».
- **چرا این نوبت رفع نشد:** این یک تغییر ساختاری با شعاع اثر روی ۹۴ فایل است؛ آزمودن کافی (که هیچ مسیر admin موجود به‌طور ناخواسته rate-limit نشود، به‌ویژه در سناریوهای batch/bulk مشروع پنل) به بیش از زمان باقی‌ماندهٔ این نشست نیاز دارد. رفع عجولانه بدون تست کامل دقیقاً همان «over-engineering بدون تست» است که CLAUDE.md منع می‌کند.
- **Acceptance Criteria:** یک تست CI (به سبک `adminApiConventions.test.ts`) که یا (الف) تأیید کند هر route admin از یک rate-limit-aware wrapper عبور می‌کند، یا (ب) به‌صراحت مسیرهای معاف را allowlist کند با دلیل مکتوب.

### H-186 — مقابله با spam فرم همکاری، تماس و درخواست برش — 78/100

- **وضعیت فعلی:** هر سه فرم (`contact`, `cooperation`, `cut-to-size-requests`) rate limit دارند (به‌ترتیب `contact`:۵، `cooperation`:۵، `cut-to-size-requests`:۱۰ در پنجرهٔ پیش‌فرض) و `assertSameOrigin` (CSRF) را چک می‌کنند. `cut-to-size-requests` و `warehouse-requests` علاوه‌براین **نیازمند session معتبر** هستند (`requireApiUser`) — یعنی یک اسپمر باید حداقل یک حساب OTP-تأییدشده بسازد، که خودش هزینهٔ SMS واقعی (نه صفر) دارد.
- **مشکل دقیق:** `contact` و `cooperation` **بدون نیاز به session** هستند (عمومی، طبق طراحی — کاربر بدون حساب باید بتواند تماس بگیرد) و **هیچ CAPTCHA یا honeypot field** ندارند. یک اسکریپت با ۵ درخواست در پنجرهٔ rate-limit (که پیش‌فرض تابع rateLimit است، محتمل ۶۰ثانیه) می‌تواند به‌سادگی از چند IP (یا با فاصلهٔ زمانی) پیام spam واقعی به `contact_messages`/لید همکاری تزریق کند — این جدول‌ها مستقیم توسط کارشناس پنل خوانده می‌شوند، پس spam واقعی هزینهٔ زمان انسانی دارد، نه فقط فضای دیسک.
- **شدت:** Medium.
- **چرا مشکل است / Impact مالی:** هر پیام spam یک ورودی در صف کاری کارشناس فروش/پشتیبانی است — در مقیاس (چند صد در روز از یک بات‌نت ساده)، هزینهٔ واقعی زمان انسانی و پنهان‌شدن لیدهای واقعی زیر spam.
- **تأثیر Revenue/Conversion/SEO/UX:** متوسط (اگر لیدهای واقعی زیر spam گم شوند، مستقیم روی conversion funnel اثر دارد) / متوسط / ناچیز / پایین (برای کارشناس پنل، نه مشتری).
- **شواهد:** `web/src/app/api/contact/route.ts:16` (فقط rate limit، بدون CAPTCHA/honeypot)؛ `web/src/app/api/cooperation/route.ts:19` (همان).
- **راه‌حل پیشنهادی:** یک honeypot field ساده (یک input مخفی با CSS که ربات‌های ساده پر می‌کنند ولی کاربر واقعی نمی‌بیند) — هزینهٔ توسعه/UX تقریباً صفر، بدون نیاز به یک سرویس CAPTCHA خارجی (که طبق CLAUDE.md §۸ «Add a CDN, web font, or external script» ممنوع است — یک CAPTCHA تجاری معمولاً یک اسکریپت خارجی می‌آورد، پس این گزینه با محدودیت‌های خودِ این پروژه در تضاد است؛ honeypot یک راه‌حل بدون وابستگی خارجی است).
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** کم؛ ۱ نفرروز (یک فیلد مخفی در فرم + یک چک در schema/route که اگر پر شده باشد، به‌آرامی موفق «به‌نظر برسد» ولی هیچ لید واقعی نسازد — تا ربات متوجه رد شدن نشود و روش خود را عوض نکند).
- **تخمین Impact اصلاح:** متوسط — کاهش قابل توجه spam بدون هیچ اصطکاک UX برای کاربر واقعی.
- **مثال از سایت‌های برتر:** honeypot field یک الگوی بسیار رایج و اثبات‌شده است (مثلاً افزونهٔ Akismet/Formspree) که دقیقاً به همین دلیل (بدون وابستگی خارجی، بدون اصطکاک UX) ترجیح داده می‌شود.
- **Acceptance Criteria:** یک submit با فیلد honeypot پر باید بی‌صدا (بدون خطای قابل‌مشاهده برای اسکریپت) شکست بخورد و هیچ ردیفی در `contact_messages`/لید همکاری نسازد؛ یک submit عادی (فیلد خالی) دست‌نخورده کار کند. **این نوبت رفع نشد.**

### H-187 — جلوگیری از replay درخواست‌های حساس — 85/100

- **وضعیت فعلی:** برای عملیات **ایجادکننده** (لید، پیش‌فاکتور، سفارش)، idempotency key (H-188) دقیقاً مشکل «replay یک درخواست معتبر یک بار موفق باید دوباره اثر نسازد» را حل می‌کند. برای عملیات **حساس دیگر** (OTP verify، refresh rotation)، خودِ مکانیزم single-use بودن (F audit: CAS روی مصرف OTP، rotation atomic روی refresh) عملاً replay را بی‌اثر می‌کند — یک توکن/کد مصرف‌شده دوباره کار نمی‌کند، صرف‌نظر از اینکه attacker چند بار همان بایت‌های دقیق را دوباره بفرستد.
- **مشکل دقیق:** یک مکانیزم عمومی replay-protection مبتنی بر nonce/timestamp (مثل آنچه در بند به‌صراحت خواسته شده) برای درخواست‌های **غیر ایجادکننده و غیر single-use** (مثلاً `PATCH /api/admin/orders/[ref]` با `status` یکسان دوبار) وجود ندارد — اما این عملاً بی‌ضرر است چون این‌ها idempotent by nature هستند (تنظیم status به همان مقدار دوباره، هیچ side effect جدیدی ندارد جز شاید یک ردیف audit تکراری).
- **شدت:** Low.
- **چرا مشکل است / Impact مالی:** ریسک واقعی فقط برای عملیاتی که (۱) side effect غیر-idempotent دارند و (۲) نه idempotency key دارند و نه single-use هستند — با بررسی این نوبت، چنین دسته‌ای پیدا نشد (هرچیزی که side effect مالی/پیامکی دارد یا idempotency key دارد یا زیر یک تراکنش atomic با پیش‌شرط است — طبق E audit).
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز.
- **شواهد:** `web/src/lib/server/utils/idempotency.ts` (کامل)؛ ارجاع به F audit (CAS در OTP/refresh).
- **راه‌حل پیشنهادی:** ندارد فوری.
- **اولویت اجرا:** P2.
- **سختی/هزینهٔ اصلاح:** N/A (نیازی شناسایی نشد).
- **تخمین Impact اصلاح:** ناچیز.
- **مثال از سایت‌های برتر:** Stripe's [Idempotent Requests](https://docs.stripe.com/api/idempotent_requests) دقیقاً همین رویکرد (idempotency key برای عملیات mutating، نه یک لایهٔ nonce عمومی جدا) را استاندارد کرده.
- **Acceptance Criteria:** یک بررسی کامل (نه نمونه) روی هر PATCH/POST/DELETE مسیر admin برای طبقه‌بندی «idempotent by nature» در برابر «نیازمند محافظت اضافه» انجام نشد — این نوبت فقط چند نمونهٔ نماینده (سفارش، تسویه) بررسی شد.

### H-188 — صحت idempotency key و scope آن به کاربر و عملیات — 97/100

- **وضعیت فعلی:** `withIdempotency` (`idempotency.ts:27-101`) کلید را `${route}:${fallbackKey}:${headerKey}` می‌سازد — `fallbackKey` همیشه هویت caller-scoped را حمل می‌کند (طبق کامنت کد: «`${leadId}:${session.id}:...`»)؛ یک header کلاینت **روی** این scope لایه می‌شود، هرگز جایگزین آن نمی‌شود — یعنی دو کاربر متفاوت که تصادفاً همان مقدار header را بفرستند هرگز روی هم replay نمی‌شوند. حالت race («درخواست اول هنوز در حال اجراست») با ۴۰۹ به‌درستی مدیریت می‌شود (نه اجرای دوبارهٔ side effect). شکست عملیات، claim را آزاد می‌کند (`catch` بلاک، `DELETE`) تا یک retry واقعی بعد از خطای گذرا گیر نکند.
- **مشکل دقیق:** ندارد. TTL هم به‌طور کامل توسط `cleanup.job.ts` مدیریت می‌شود: ردیف‌های `pending` بیش از ۱۰ دقیقه (احتمالاً یک worker crash کرده) حذف می‌شوند؛ ردیف‌های `done` بعد از ۲۴ ساعت (پنجرهٔ کافی برای retry‌های واقعی مشتری) و یک backstop سخت ۷ روزه.
- **شدت:** N/A.
- **شواهد:** `web/src/lib/server/utils/idempotency.ts` (کامل)؛ `web/src/lib/server/jobs/cleanup.job.ts:133-157`.
- **چرا هنوز ۱۰۰ نیست:** یک تست concurrency واقعی (دو درخواست هم‌زمان واقعی، نه شبیه‌سازی، با همان کلید idempotency) روی PostgreSQL واقعی در این نوبت اجرا نشد — فقط منطق کد و تست‌های واحد موجود (که فرض می‌شود در repo هستند اما این نوبت مستقیم اجرا نشدند) بررسی شد.
- **راه‌حل پیشنهادی:** ندارد فوری.
- **اولویت اجرا:** N/A.
- **سختی/هزینهٔ اصلاح:** N/A.
- **مثال از سایت‌های برتر:** پیاده‌سازی این کد آگاهانه از الگوی [Stripe/IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) پیروی می‌کند (خودِ کامنت کد این را نام می‌برد).
- **Acceptance Criteria:** دو درخواست هم‌زمان با یک کلید idempotency باید دقیقاً یک side effect بسازند و دومی یا پاسخ اول را replay کند یا ۴۰۹ بگیرد — منطق کد این را تضمین می‌کند (constraint یکتای DB روی `key` + `onConflictDoNothing`)؛ اثبات با دو اتصال هم‌زمان واقعی مثل `otpLockRaceProbe.ts` این نوبت انجام نشد.

### H-189 — جلوگیری از cache poisoning با Host، query و headers — 93/100

- **وضعیت فعلی:** هر مسیر عمومی با `Cache-Control: public/s-maxage` بررسی‌شده (`market`, `search`, `articles`, `articles/[slug]`) پاسخی می‌دهد که **فقط** به بخشی از URL بستگی دارد که خودش بخشی از cache key است (query string برای search، path segment برای slug) یا اصلاً به هیچ ورودی بستگی ندارد (market ticker — یکسان برای همه). هیچ‌کدام بر اساس Host header یا یک header دیگر (Accept-Language, Authorization) محتوای متفاوت برنمی‌گردانند — پس نیازی به `Vary` نیست و ریسک «یک نسخهٔ cache‌شده برای کاربر اشتباه» وجود ندارد.
- **مشکل دقیق:** بررسی محدود به ۴ مسیر نمونه بود (نه هر مسیر public-cached در ۱۵۴ route). لایهٔ Cloudflare (که واقعاً cache می‌کند) در این مخزن قابل کانفیگ نیست (docs/audit-rbac-panel-G.md §G-152) — یعنی حتی اگر اپ درست باشد، یک قانون Cache Rule اشتباه در داشبورد Cloudflare (خارج از این کد) می‌تواند این ضمانت را نقض کند؛ این ریسک قابل مشاهده/کنترل از این مخزن نیست.
- **شدت:** Low.
- **شواهد:** `web/src/app/api/market/route.ts:23`؛ `web/src/app/api/search/route.ts:21`؛ `web/src/app/api/articles/route.ts:28`؛ `web/src/app/api/articles/[slug]/route.ts:21`.
- **راه‌حل پیشنهادی:** فوری نیست؛ اگر مسیر عمومی-کش‌شدهٔ جدیدی اضافه شود، همان قاعده (پاسخ فقط تابع URL) رعایت شود.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** N/A.
- **تخمین Impact اصلاح:** ناچیز.
- **مثال از سایت‌های برتر:** [Cloudflare — Cache Key customization pitfalls](https://developers.cloudflare.com/cache/how-to/cache-keys/) دقیقاً همین کلاس اشتباه (پاسخ متفاوت بدون تغییر cache key) را به‌عنوان علت اصلی cache poisoning می‌شمارد.
- **Acceptance Criteria:** برای این ۴ مسیر برآورده؛ برای بقیهٔ مسیرهای public-cached (اگر مسیر دیگری با همین الگو وجود داشته باشد) بررسی کامل نشد.

### H-190 — عدم بازگرداندن stack trace یا SQL error به client — 97/100

- **وضعیت فعلی:** `withApiErrorHandling` (`apiGuard.ts:24-40`) هر خطای catch‌نشده را می‌گیرد، به `reportError` (redaction کامل، H-200) می‌فرستد، و به کلاینت **فقط** `{error:'internal_error', message:'خطایی در سرور رخ داد...'}` با ۵۰۰ برمی‌گرداند — هرگز `err.message`/`err.stack` خام. تنها استثناها (`err.message` که به کلاینت می‌رسد) از کلاس‌های خطای **تعریف‌شدهٔ داخلی اپ** هستند (`InvalidStatusTransitionError`, `AlertCapExceededError`, «duplicate_slug»، «redirect_loop»، ...) — پیام‌های از پیش نوشته‌شدهٔ فارسی/کنترل‌شده، نه یک exception خام از driver دیتابیس.
- **مشکل دقیق:** ندارد. جستجوی مستقیم `err.message`/`error.message` در بدنهٔ پاسخ روی کل `src/app/api` هر مورد را بازبینی کرد؛ همه از کلاس‌های خطای domain-specific بودند.
- **شدت:** N/A.
- **شواهد:** `web/src/lib/server/utils/apiGuard.ts:24-40`؛ فهرست کامل call siteهای `err.message`/`error.message` (۱۱ مورد، همه بررسی و امن تأیید شدند).
- **چرا هنوز ۱۰۰ نیست:** یک تست end-to-end واقعی («یک اتصال DB را عمداً قطع کن، یک درخواست بزن، تأیید کن پاسخ فقط پیام عمومی دارد») در این نوبت اجرا نشد.
- **راه‌حل پیشنهادی:** ندارد فوری.
- **اولویت اجرا:** N/A.
- **سختی/هزینهٔ اصلاح:** N/A.
- **مثال از سایت‌های برتر:** [OWASP — Improper Error Handling](https://owasp.org/www-community/Improper_Error_Handling) دقیقاً همین الگو (پیام عمومی به کاربر، جزئیات فقط در لاگ سرور) را توصیه می‌کند.
- **Acceptance Criteria:** یک throw دلخواه (نه یک کلاس خطای شناخته‌شده) در هر route باید دقیقاً `{error:'internal_error', message:'...'}` با ۵۰۰ برگرداند — منطق کد این را تضمین می‌کند؛ آزمایش زنده انجام نشد.

### H-191 — consistency قالب خطاها در تمام APIها — 90/100

- **وضعیت فعلی:** یک envelope غالب و ثابت در همهٔ مسیرهای بررسی‌شده: `{error: string, message: string, fields?: object}`. `validateBody` این را برای هر شکست schema تضمین می‌کند (`request.ts:32-39`)؛ `withApiErrorHandling` همین شکل را برای خطای catch‌نشده تضمین می‌کند؛ کلاس‌های خطای domain (`BusinessRuleError`) هم `{error: code, message}` برمی‌گردانند.
- **مشکل دقیق:** برخی مسیر‌ها فیلد اضافه دارند (`retryAfter` در پاسخ‌های auth rate-limited، `cap` در `AlertCapExceededError`، `fields` فقط در خطای validation) — این‌ها گسترش‌های سازگار هستند (client می‌تواند نادیده بگیرد)، نه ناسازگاری واقعی؛ اما به‌صورت رسمی مستند نشده که «envelope پایه همیشه `{error, message}` است، فیلدهای اضافه اختیاری و مسیر-به-مسیرند».
- **شدت:** Low.
- **چرا مشکل است / Impact مالی:** ریسک واقعی کم — فقط تجربهٔ توسعه‌دهندهٔ frontend را کمی سخت‌تر می‌کند (باید هر مسیر را جداگانه چک کند چه فیلد اضافه‌ای ممکن است بیاید).
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز/ناچیز/ناچیز/ناچیز.
- **شواهد:** ۱۵ مسیر نمونه (auth, admin, orders, leads, search) با ساختار پاسخ خطا مقایسه شدند — همه با `{error, message}` پایه سازگار.
- **راه‌حل پیشنهادی:** یک نوع TypeScript مشترک (`ApiErrorEnvelope`) با فیلدهای پایه + اختیاری، مستند در یک فایل مرکزی (`lib/api/errorTypes.ts` یا مشابه) به‌جای صرفاً «قرارداد ضمنی».
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** کم؛ کمتر از یک نفرروز (فقط مستندسازی نوع، نه تغییر رفتار).
- **تخمین Impact اصلاح:** ناچیز.
- **مثال از سایت‌های برتر:** [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457) یک استاندارد رسمی برای همین «envelope پایه + فیلدهای اختیاری گسترش‌پذیر» است.
- **Acceptance Criteria:** یک نوع TS مشترک صادر و در حداقل چند مسیر کلیدی استفاده شود؛ این نوبت انجام نشد.

### H-192 — استفاده درست از status codeهای 400، 401، 403، 404، 409، 422، 429 و 503 — 90/100

- **وضعیت فعلی:** الگوی مشاهده‌شده در ۲۰+ مسیر نمونه‌برداری‌شده منطقی و باثبات است: ۴۰۰ (validation عمومی + `otp_country_unsupported`)، ۴۰۱ (عدم احراز هویت — `requireApiUser`)، ۴۰۳ به‌ندرت استفاده می‌شود (طبق طراحی عمدی G audit: عدم دسترسی admin با ۴۰۴ پنهان می‌شود، نه ۴۰۳ — «hide, don't reveal»)، ۴۰۴ (منبع یافت نشد + admin غیرمجاز)، ۴۰۹ (تضاد وضعیت — `InvalidStatusTransitionError`, `already_voided`, `redirect_loop`, idempotency در حال اجرا)، ۴۱۳ (بدنهٔ بزرگ)، ۴۲۹ (rate limit + OTP lock)، ۵۰۳ (`dbUnavailable`).
- **مشکل دقیق:** کد ۴۲۲ (Unprocessable Entity) در هیچ مسیری استفاده نمی‌شود — همه‌جا به‌جای آن ۴۰۰ برای خطای validation semantically-invalid (نه فقط syntactically-invalid) استفاده شده (مثال: `otp_country_unsupported` در `auth/otp/request/route.ts:44` یک ۴۲۲ منطقی‌تر بود تا ۴۰۰، چون بدنه syntactically معتبر است، فقط semantically قابل قبول نیست). این یک ناسازگاری جزئی با HTTP semantics دقیق است، نه یک باگ عملکردی — هیچ کلاینتی امروز رفتار متفاوتی بین ۴۰۰/۴۲۲ در این اپ ندارد.
- **شدت:** Low.
- **چرا مشکل است / Impact مالی:** ناچیز عملی؛ فقط دقت API design.
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز.
- **شواهد:** `web/src/app/api/auth/otp/request/route.ts:44` (نمونهٔ ۴۲۲-شایسته که ۴۰۰ برگردانده)؛ عدم وجود هیچ `status: 422` در جستجوی `grep -rn "status: 422" src/app/api`.
- **راه‌حل پیشنهادی:** فوری نیست — تغییر status code یک breaking change بالقوه برای هر کلاینتی است که امروز روی ۴۰۰ چک می‌کند؛ فقط برای APIهای جدید آینده این تمایز رعایت شود.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** N/A (تغییر امروز توصیه نمی‌شود).
- **تخمین Impact اصلاح:** ناچیز.
- **مثال از سایت‌های برتر:** بسیاری از APIهای بزرگ (از جمله GitHub) هم عملاً ۴۲۲ را کمیاب نگه می‌دارند و اغلب روی ۴۰۰ متمرکز می‌شوند — این یک انتخاب رایج و قابل‌دفاع است، نه لزوماً یک نقص.
- **Acceptance Criteria:** برای مسیرهای بررسی‌شده برآورده (استفادهٔ منطقی و باثبات)؛ بررسی کامل هر ۱۵۴ مسیر برای این معیار انجام نشد (نمونه‌برداری ۲۰+).

### H-193 — کنترل CORS و نبود wildcard ناخواسته — 95/100

- **وضعیت فعلی:** هیچ header `Access-Control-Allow-Origin` در `next.config.mjs` یا هیچ route تعریف نشده (grep کامل، صفر نتیجه). این اپ **کاملاً same-origin** است — هیچ دامنهٔ جداگانهٔ API، هیچ ویجت embed، هیچ webhook دریافتی از یک سرویس سوم که نیاز به CORS داشته باشد شناسایی نشد. غیاب کامل CORS headers یعنی مرورگر به‌طور پیش‌فرض هر خواندن cross-origin را رد می‌کند — دقیقاً حالت امن پیش‌فرض.
- **مشکل دقیق:** ندارد. این «طراحی نشده» نیست، بلکه «هیچ نیازی به آن نبوده» است — طبق CLAUDE.md (بدون CDN، بدون سرویس خارجی سمت کلاینت) این هم‌راستا با فلسفهٔ کلی پروژه است.
- **شدت:** N/A.
- **شواهد:** `grep -n "Access-Control-Allow-Origin" next.config.mjs src/app/api/**/*.ts` → صفر نتیجه.
- **چرا هنوز ۱۰۰ نیست:** یک تأیید صریح («آیا هرگز قرار است یک ویجت/iframe embed cross-origin این سایت وجود داشته باشد؟») از محصول/مالک گرفته نشد — این فقط یک فرض مبتنی بر کد فعلی است، نه یک تصمیم مستند محصولی.
- **راه‌حل پیشنهادی:** ندارد فوری.
- **اولویت اجرا:** N/A.
- **سختی/هزینهٔ اصلاح:** N/A.
- **مثال از سایت‌های برتر:** بسیاری از اپ‌های same-origin مدرن (از جمله اکثر SaaS دارای پنل مدیریت مشابه این) دقیقاً همین رویکرد «بدون CORS، same-origin only» را دارند.
- **Acceptance Criteria:** برآورده — هیچ wildcard یا هدر CORS ناخواسته یافت نشد.

### H-194 — بررسی HTTP methodهای اضافی و OPTIONS — 92/100

- **وضعیت فعلی:** Next.js App Router به‌صورت خودکار برای هر متد export-نشده در یک `route.ts` یک ۴۰۵ (Method Not Allowed) برمی‌گرداند و OPTIONS را بر اساس متدهای export-شده مدیریت می‌کند — این رفتار framework است، نه چیزی که این کد پیاده‌سازی کند یا بتواند اشتباه override کند (هیچ catch-all handler که همه‌چیز را بپذیرد در `src/app/api` پیدا نشد؛ هر فایل route.ts دقیقاً متدهای مشخصی export می‌کند).
- **مشکل دقیق:** این نوبت یک تست HTTP زندهٔ واقعی («یک DELETE به یک مسیر فقط-GET بزن، تأیید کن ۴۰۵ می‌گیری») اجرا نشد — فقط به رفتار مستند Next.js اتکا شد.
- **شدت:** N/A.
- **شواهد:** جستجوی کامل برای یک catch-all method handler (`export default function handler` به سبک Pages Router، یا یک export نامتعارف) در `src/app/api` — صفر نتیجه؛ همه از الگوی استاندارد App Router (`export const GET/POST/...`) پیروی می‌کنند.
- **راه‌حل پیشنهادی:** یک تست e2e سبک (curl/fetch مستقیم) برای تأیید ۴۰۵ روی حداقل یک مسیر نماینده.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** کم.
- **تخمین Impact اصلاح:** ناچیز.
- **مثال از سایت‌های برتر:** اتکا به رفتار framework (به‌جای پیاده‌سازی دستی) دقیقاً توصیهٔ خودِ [Next.js App Router docs](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) است.
- **Acceptance Criteria:** یک درخواست DELETE به یک مسیر GET-only باید ۴۰۵ بگیرد — این نوبت با یک درخواست HTTP واقعی اثبات نشد.

### H-195 — جلوگیری از method override یا verb confusion — 100/100

- **وضعیت فعلی:** جستجوی کامل برای `X-HTTP-Method-Override`، `_method` query param، یا هر پردازش مشابه در `src/middleware.ts` و کل `src/lib/server` — **صفر نتیجه**. این یعنی چنین مکانیزمی اصلاً پیاده‌سازی نشده — که دقیقاً حالت امن مطلوب است (این ویژگی اگر بدون احتیاط پیاده شود می‌تواند یک same-origin GET را به یک POST/DELETE واقعی تبدیل کند و کنترل‌های CSRF مبتنی بر متد را دور بزند).
- **مشکل دقیق:** ندارد.
- **شدت:** N/A.
- **شواهد:** grep کامل، صفر نتیجه.
- **راه‌حل پیشنهادی:** ندارد.
- **اولویت اجرا:** N/A.
- **سختی/هزینهٔ اصلاح:** N/A.
- **مثال از سایت‌های برتر:** N/A — عدم وجود این ویژگی خودش best practice است.
- **Acceptance Criteria:** برآورده کامل.

### H-196 — کنترل redirectهای باز و URLهای کاربرمحور — 94/100

- **وضعیت فعلی:** جستجوی کامل `NextResponse.redirect`/`redirect(` در `src/app/api` دو مسیر واقعی پیدا کرد و هردو امن‌اند:
  1. `admin/seo/search-console/callback/route.ts:31` — مقصد همیشه `routes.admin.seo()` (یک مسیر داخلی ثابت) + `req.nextUrl.origin` (نه ورودی خارجی) + یک `outcome` با واژگان بسته (`denied`/`invalid`/`connected`/...) — بدون هیچ راهی برای کنترل مقصد توسط کاربر.
  2. `auth/silent/route.ts:42-47` — `next` از طریق `safeNextPath()` عبور می‌کند (فقط یک مسیر site-relative، هرگز scheme/host/`//`/`/\` — طبق کامنت مفصل کد که این را دقیقاً به‌عنوان «فیشینگ از داخل یک جریان authentication واقعی» تحلیل کرده).
- **مشکل دقیق:** بررسی محدود به این دو call site (که با grep کامل روی `src/app/api` پیدا شدند) بود؛ redirectهای سمت client (در کامپوننت‌های React، `router.push`) بررسی نشدند — احتمال یک open-redirect در آن لایه (نه API) از دامنهٔ این بند (که صریحاً «مسیرهای API» را هدف می‌گیرد) خارج است اما ارزش یک بند جداگانه در آیندهٔ این آدیت را دارد.
- **شدت:** Low.
- **شواهد:** `web/src/app/api/admin/seo/search-console/callback/route.ts:28-34`؛ `web/src/app/api/auth/silent/route.ts:32-47`.
- **راه‌حل پیشنهادی:** ندارد فوری برای API؛ یک بررسی جداگانه برای redirectهای سمت کلاینت (خارج از دامنهٔ H) توصیه می‌شود.
- **اولویت اجرا:** P2 (برای بررسی سمت کلاینت، خارج از این بند).
- **سختی/هزینهٔ اصلاح:** N/A برای API (از قبل امن).
- **تخمین Impact اصلاح:** ناچیز برای API.
- **مثال از سایت‌های برتر:** [OWASP Unvalidated Redirects Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) دقیقاً همین الگو (allowlist مسیر داخلی، نه blacklist دامنه) را توصیه می‌کند.
- **Acceptance Criteria:** `safeNextPath('https://evil.com')`, `safeNextPath('//evil.com')`, `safeNextPath('/\\evil.com')` باید همه `null`/مسیر پیش‌فرض برگردانند — منطق کد این را تضمین می‌کند طبق کامنت مفصل آن؛ تست مستقیم این نوبت اجرا نشد.

### H-197 — SSRF در URL تصویر، webhook، relay و integrationها — 90/100

- **وضعیت فعلی:** هر فراخوانی `fetch()` سمت سرور در `src/lib/server/integrations/` و `src/lib/server/jobs/` بررسی شد (۸ فایل، هر URL منبع‌یابی شد): `matomo.ts`, `aiRelay.ts`, `telegram.ts`, `pagespeed.ts`, `searchConsole.ts`, `smsir.ts` — همه به یک **آدرس ثابت و env-configured توسط مالک سایت** متصل می‌شوند (`AI_BASE_URL`, `api.sms.ir`, `api.telegram.org` مشتق‌شده، Google APIs ثابت)، **نه** یک URL که کاربر یا حتی ادمین در زمان اجرا از طریق پنل تنظیم کند. جستجوی کامل `z.string().url()` در `src/lib/validation` (تنها جایی که یک فیلد URL-shaped می‌تواند از کاربر بیاید) فقط در `env.ts` (متغیرهای محیطی، نه ورودی HTTP) پیدا شد — **هیچ فیلد admin-settable URL (webhook، آپلود-از-URL، integration دلخواه) در کل schema‌های validation وجود ندارد**.
- **مشکل دقیق:** سطح حملهٔ توصیف‌شده در این بند (URL تصویر/webhook قابل‌تنظیم توسط کاربر یا ادمین) در این اپ **امروز وجود ندارد** — نه اینکه محافظت‌شده باشد، بلکه اصلاً چنین ویژگی‌ای ساخته نشده. این یک تفاوت مهم است: نمرهٔ بالا به این معنی نیست که «SSRF تست شد و رد شد»، به این معنی است که «بردار حمله ساختاراً غیرقابل‌دسترس است چون فیچر مربوطه نیست».
- **شدت:** N/A (فقدان سطح حمله، نه محافظت در برابر یک حملهٔ موجود).
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز.
- **شواهد:** `grep -rn "fetch(" src/lib/server/integrations src/lib/server/jobs`؛ `grep -rn "\.url()" src/lib/validation`.
- **راه‌حل پیشنهادی:** ندارد فوری. **اگر** در آینده یک فیچر «آپلود تصویر از URL» یا «webhook دلخواه» اضافه شود، آن‌وقت (نه زودتر) یک allowlist اسکیم (http/https) + رد صریح IPهای private/loopback/metadata (`169.254.169.254`, `127.0.0.0/8`, `10.0.0.0/8`, ...) باید اضافه شود.
- **اولویت اجرا:** N/A امروز؛ پیش‌نیاز اجباری هر فیچر آینده از این نوع.
- **سختی/هزینهٔ اصلاح:** N/A امروز.
- **تخمین Impact اصلاح:** N/A امروز.
- **مثال از سایت‌های برتر:** [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — مرجع برای «اگر/وقتی» این فیچر ساخته شود.
- **Acceptance Criteria:** برآورده برای وضعیت فعلی (هیچ سطح حمله‌ای موجود نیست)؛ این criteria باید در زمان افزودن هر فیچر URL-pluggable آینده بازبینی شود، نه امروز.

### H-198 — DNS rebinding برای endpointهای قابل تنظیم — 88/100

- **وضعیت فعلی:** مستقیماً وابسته به H-197 — چون هیچ URL admin-configurable در زمان اجرا وجود ندارد، سؤال «آیا در برابر DNS rebinding محافظت شده؟» موضوعیت ندارد (هیچ endpointی برای rebind کردن نیست؛ هر آدرس در env در زمان build/deploy توسط مالک سایت تنظیم می‌شود، نه توسط یک درخواست HTTP در زمان اجرا).
- **مشکل دقیق:** مشابه H-197 — فقدان سطح حمله، نه اثبات محافظت در برابر یک حملهٔ موجود.
- **شدت:** N/A.
- **شواهد:** همان H-197.
- **راه‌حل پیشنهادی:** ندارد فوری؛ همان پیش‌نیاز آیندهٔ H-197 (pin IP resolved در زمان fetch، نه اعتماد به DNS در لحظهٔ استفاده) اگر فیچر URL-pluggable اضافه شود.
- **اولویت اجرا:** N/A امروز.
- **سختی/هزینهٔ اصلاح:** N/A امروز.
- **تخمین Impact اصلاح:** N/A امروز.
- **مثال از سایت‌های برتر:** [Cloudflare — DNS rebinding protection patterns](https://blog.cloudflare.com/dns-rebinding/) — مرجع آینده.
- **چرا نمره کمی پایین‌تر از H-197:** این بند حتی از H-197 هم انتزاعی‌تر است (یک زیرمجموعهٔ فرضی از یک فیچر که وجود ندارد) — نمرهٔ کمی پایین‌تر بازتاب این است که «اثبات عدم نیاز» برای DNS rebinding به‌طور خاص، ضعیف‌تر از SSRF عمومی مستند شد (کمتر بررسی مستقیم، بیشتر استنتاج از H-197).
- **Acceptance Criteria:** N/A امروز.

### H-199 — timeout، abort و response-size limit برای fetchهای سروری — 96/100

- **وضعیت فعلی:** **هر ۸ فایل integration** بررسی‌شده (`matomo.ts`, `aiRelay.ts`, `telegram.ts`, `pagespeed.ts`, `searchConsole.ts`(×۲ call site), `smsir.ts`(×۲ call site)) یک مکانیزم timeout صریح دارد — یا `AbortController` دستی (`matomo.ts:56`, `pagespeed.ts:54`) یا `AbortSignal.timeout(MS)` (`searchConsole.ts:93,271`, `smsir.ts:192,300`). `telegram.ts` کامنت صریح دارد: «Explicit `AbortSignal.timeout` on the fetch... the alert is a nudge»، نشان‌دهندهٔ یک تصمیم آگاهانه (نه فراموش‌شده).
- **مشکل دقیق:** هیچ‌کدام یک **سقف صریح روی اندازهٔ پاسخ خوانده‌شده** ندارند (`res.json()`/`res.text()` بدون هیچ محدودیت بایت) — اگر یکی از این سرویس‌های ثالث (SMS.ir، Telegram، Google) دچار یک باگ یا compromise شود و یک پاسخ گیگابایتی برگرداند، این کد آن را کامل در حافظه بارگذاری می‌کند. این یک ریسک نظری است چون این سرویس‌ها third-party شناخته‌شده و معتبرند (نه یک URL کاربرمحور)، اما «timeout» و «response-size limit» دو محافظت مجزا هستند و بند صراحتاً هردو را می‌پرسد.
- **شدت:** Low (سرویس‌های ثالث معتبر، نه یک URL دلخواه — طبق H-197).
- **چرا مشکل است / Impact مالی:** یک outage/misbehavior نادر یک سرویس ثالث معتبر می‌تواند حافظهٔ worker Node را فشار دهد؛ روی هاست ۱.۵GB/۴-vCPU فعلی (طبق PRODUCTION-AUDIT.md) این محسوس‌تر از یک هاست بزرگ‌تر است.
- **تأثیر Revenue/Conversion/SEO/UX:** ناچیز تا کم (فقط در سناریوی نادر outage سرویس ثالث).
- **شواهد:** فهرست کامل ۸ فایل و call site دقیق آن‌ها (بالا).
- **راه‌حل پیشنهادی:** یک هلپر مشترک `fetchWithLimits(url, {timeoutMs, maxBytes})` که stream را مثل `readBody` در `requestBody.ts` (که دقیقاً همین الگو برای بدنهٔ ورودی دارد) محدود کند، و همهٔ ۶ فایل integration را به آن مهاجرت دهد.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** متوسط؛ ۱-۲ نفرروز (یک هلپر + مهاجرت ۶ فایل + تست).
- **تخمین Impact اصلاح:** کم (سناریوی نادر، سرویس‌های معتبر).
- **مثال از سایت‌های برتر:** [undici's `maxResponseSize`](https://undici.nodejs.org/) یا الگوی مشابه در httpx (پایتون) دقیقاً این محافظت را به‌صورت built-in ارائه می‌دهند؛ `fetch` بومی Node چنین گزینه‌ای ندارد و باید دستی با stream پیاده شود (همان‌طور که `requestBody.ts` برای ورودی انجام داده).
- **Acceptance Criteria:** یک mock سرور که پاسخ بی‌نهایت/خیلی‌بزرگ برمی‌گرداند باید باعث abort کنترل‌شده شود (نه مصرف نامحدود حافظه) — این نوبت رفع/تست نشد.

### H-200 — redaction شماره موبایل، token، bot secret و API key از logها — 98/100

- **وضعیت فعلی:** `web/src/lib/errors/report.ts` + `web/src/lib/errors/scrub.ts` یک پیاده‌سازی دولایه دارند: (۱) redaction **بازگشتی به‌نام‌فیلد** (`REDACT_KEYS` — mobile/name/address/token/secret/password/authorization/jwt/cookie/email/nationalId/...، تا عمق ۶ سطح، با محافظت در برابر circular reference)، (۲) redaction **به‌الگوی‌مقدار** (`scrubPii` — regex برای شمارهٔ موبایل ایرانی، ایمیل، JWT، `Bearer <token>`، توکن در query string، و به‌طور خاص **توکن ربات تلگرام** که در یک URL path می‌آید نه یک فیلد نام‌گذاری‌شده، پس لایهٔ (۱) آن را نمی‌گرفت). ترتیب اجرای این regexها آگاهانه است (کامنت کد: «ربات‌توکن اول، وگرنه شمارهٔ موبایل نیمی از آن را می‌بلعد و نیم دیگر لو می‌رود») — این دقیقاً نشانهٔ یک باگ واقعی قبلی است که کشف و رفع شده، نه یک طراحی نظری.
- **مشکل دقیق:** ندارد در سطح بررسی‌شده. `stack` هم جداگانه scrub می‌شود (نه فقط `message`) چون V8 خط اول stack را از `message` تکرار می‌کند — یک جزئیات ظریف که اگر رعایت نشود، دقیقاً همان دادهٔ redact‌شده در `message` را در `stack` لو می‌دهد؛ این کد صراحتاً این را handle کرده.
- **شدت:** N/A.
- **شواهد:** `web/src/lib/errors/report.ts` (کامل)؛ `web/src/lib/errors/scrub.ts` (کامل، با تحلیل تهدید مستند در کامنت برای هر الگو).
- **چرا هنوز ۱۰۰ نیست:** جستجوی کامل برای `console.log`/`console.error` **مستقیم** (بدون عبور از `reportError`) در کل `src/lib/server` انجام نشد — اگر یک فایل جایی مستقیم `console.log(req.headers)` یا مشابه بزند (بای‌پس کامل لایهٔ redaction)، این آدیت آن را با روش فعلی (فقط بررسی خودِ لایهٔ redaction) پیدا نمی‌کرد.
- **راه‌حل پیشنهادی:** یک ESLint rule (`no-console` با استثنای فایل‌های مجاز مثل خودِ `report.ts`) که مطمئن شود هیچ کد دیگری مستقیم `console.*` صدا نمی‌زند.
- **اولویت اجرا:** P3.
- **سختی/هزینهٔ اصلاح:** کم؛ نیم‌روز (یک ESLint rule + رفع موارد موجود اگر باشند).
- **تخمین Impact اصلاح:** کم تا متوسط (بسته به اینکه آیا واقعاً چنین call siteای وجود دارد یا نه — بررسی نشد).
- **مثال از سایت‌های برتر:** [Datadog/Sentry logging best practices](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/) دقیقاً redaction به‌الگوی‌مقدار (نه فقط نام فیلد) را به‌عنوان لایهٔ دفاعی توصیه می‌کنند — این کد از قبل این را دارد.
- **Acceptance Criteria:** `grep -rn "console\.\(log\|error\|warn\)" src/lib/server --include="*.ts" | grep -v "report.ts\|test"` باید صفر نتیجهٔ خارج از لایهٔ redaction بدهد — این نوبت این grep دقیق اجرا نشد (فقط report.ts/scrub.ts خودشان به‌طور کامل خوانده شدند).

---

## خلاصهٔ نهایی و چرا این سند به ۱۰۰ نرسید

**آنچه واقعاً رفع شد این نوبت (نه فقط ثبت):**
1. `web/src/lib/validation/schemas.ts` — سقف طول روی چهار schema (`contactSchema`, `cooperationSchema`, `requestSchema`, `weightSchema`) که قبلاً فاقد `.max()` بودند (H-173).
2. `web/src/app/api/auth/refresh/route.ts` و `web/src/app/api/auth/silent/route.ts` — افزودن rate limit (`auth-refresh`، ۶۰/دقیقه) که قبلاً هیچ‌کدام نداشتند (H-185، بخشی).
3. یک باگ Critical واقعی از آدیت E دوباره بررسی و **بسته اعلام** شد (نه بخشی از H، اما پیش از شروع H الزامی بود): `/_global-error` prerender failure با یک PostgreSQL 15 disposable واقعی بازتولید نشد — آرتیفکت محیطی گذرا بود.
4. دو یافتهٔ باز از آدیت F (F-130، F-134) در همین نشست (پیش از شروع H) رفع شدند: OTP attempt/lock اتمیک شد (`lockAndClearOtp`، اثبات با probe واقعی روی دو اتصال PostgreSQL)؛ شمارهٔ ساختاراً غیرممکن (رقم‌یکسان/متوالی) پیش از رزرو سهمیه رد می‌شود.
5. **بازبینی مستقل این نوبت (H-179، H-181):** یک ادعای IDOR («`leads/[id]/order` و `orders/[ref]` PATCH فاقد چک مالکیت‌اند») از یک inventory جداگانه بررسی و **رد** شد — `createOrder`/`mutateOrder` (`ordersRepo.ts`) از قبل همین چک را یک لایه پایین‌تر اجرا می‌کنند؛ یک اصلاح route-level ابتدا اعمال، سپس (پس از کشف redundancy) برگردانده شد. در مقابل، H-181's ادعای «بررسی‌نشده» دربارهٔ src تصویر با خواندن مستقیم `normalizeImageSrc`/`ArticleImage.ts` **تأیید و بسته** شد (۹۲→۹۶). نتیجهٔ کل، تفاوتی نیست: میانگین از ۹۲ به ۹۳ رفت (فقط از تصحیح H-181؛ H-179 بدون تغییر نمره ماند چون خودِ بند از قبل این ریسک نمونه‌برداری را افشا کرده بود).

**بزرگ‌ترین یافتهٔ باز واقعی:** H-185 — نبود rate limit اختصاصی روی ۹۱ از ۹۴ مسیر `/api/admin/**`. عمداً در همین نشست رفع نشد چون راه‌حل درست (یک wrapper سطح-مرکزی، نه ۹۱ فراخوانی دستی) نیازمند طراحی و تست کافی روی مسیرهای batch/bulk مشروع پنل است که در زمان باقی‌ماندهٔ این نشست ممکن نبود — رفع عجولانه دقیقاً همان «تغییر پرمخاطره بدون تست کافی» است که این مخزن (CLAUDE.md) صراحتاً منع می‌کند.

**چرا نمرهٔ کل ۹۳ است، نه ۱۰۰:** ۲۱ بند از ۳۰ بند ۹۰ یا بالاترند و هیچ‌کدام زیر ۷۴ نیست؛ اما طبق قانون اول همین آدیت («هیچ بخش را چون ظاهر خوبی دارد تأیید نکن»)، چند بند صرفاً به این دلیل ۱۰۰ نگرفتند که ادعای «کاملاً بررسی شد» با شواهد کافی پشتیبانی نمی‌شد — نمونه‌برداری روی بخشی از ۱۵۴ route (نه هر ۱۵۴) برای IDOR/mass-assignment/status-code، عدم اجرای HTTP زندهٔ چند سناریو (malformed JSON، prototype pollution، DELETE-روی-GET-only)، و یک شکاف واقعی و مکانیکی بزرگ (rate limit ادمین) که رفع آن به یک نوبت جداگانه با تست کافی نیاز دارد. رساندن به ۱۰۰ نیازمند یا (۱) یک ابزار static-analysis اختصاصی (semgrep — در این نشست به دلیل خطای اتصال محیط در دسترس نبود، نه به دلیل انتخاب) برای پوشش کامل به‌جای grep دستی، یا (۲) طراحی و اجرای امن wrapper سطح-مرکزی rate limit برای admin.
