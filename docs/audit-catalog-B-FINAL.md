# آدیت سخت‌گیرانه B — کاتالوگ و مدل محصولات فولادی

تاریخ: ۱۴۰۵/۰۶/۱۶ (۲۰۲۶-۰۹-۰۷)

## روش و محدودیت شواهد

کد، schema، migrationها، مسیرهای CRUD، محاسبات وزن، UI کاتالوگ، تست‌ها و تاریخچهٔ Merge بررسی شد. مجموعهٔ کامل پروژه با Node 20 شامل **۲۶۰ فایل و ۲۷۹۴ تست** بدون شکست اجرا شد؛ TypeScript، `git diff --check` و Build تولیدی Next.js با ۱۵۰ صفحه نیز موفق بودند. Commit ادغام‌شدهٔ `6a70d11` تصریح می‌کند structural identity روی dump کامل Production بررسی و collision واقعی `1/2` در برابر `12` قبل از Merge اصلاح شده و نتیجهٔ نهایی صفر collision بوده است.

مرورگر متصل در محیط حاضر موجود نبود. PostgreSQL محلی نیز روی پورت 5432 در دسترس نبود؛ بنابراین اسکن ۱۴گانهٔ تازهٔ `pnpm audit:catalog` در این نوبت روی Production دوباره اجرا نشد. این محدودیت عمداً در نمره کسر شده است.

## یافته‌ها

### B-01 — رابطهٔ Category → Subcategory → SKU

- **وضعیت فعلی:** قوی و اصلاح‌شده. **مشکل دقیق:** `category_id` تکراری SKU قبلاً می‌توانست با parent زیردسته ناسازگار شود. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** مسیر و breadcrumb غلط، 404 و قیمت‌گذاری زیر دستهٔ اشتباه؛ Revenue/Conversion/SEO/UX همگی بالا.
- **شواهد:** composite FK در `schema/catalog.ts` و migrationهای 0050/0051؛ parent در `resolveSkuParent` از sub مشتق می‌شود.
- **راه‌حل/اولویت/سختی/Impact:** FK ترکیبی با `ON UPDATE/DELETE CASCADE`؛ P0 انجام‌شده؛ متوسط؛ Impact بسیار بالا.
- **مثال برتر:** PostgreSQL برای یکپارچگی رابطه از FK واقعی استفاده می‌کند، نه validation صرف. **AC:** درج parent ناسازگار مستقیماً در DB شکست بخورد و جابه‌جایی sub تمام SKUها را اتمیک منتقل کند؛ تست پاس است.

### B-02 — uniqueness واقعی slugها

- **وضعیت:** سالم. **مشکل:** اتکا به pre-check در رقابت همزمان کافی نبود. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** دو URL یکسان یا 500 مبهم؛ SEO و UX بسیار بالا، Revenue متوسط.
- **شواهد:** unique constraint دسته و SKU و unique index `(category_id, slug)` برای sub؛ `DuplicateSlugError` خطای 409 قابل‌فهم می‌دهد.
- **راه‌حل:** enforcement دیتابیس + mapping خطا؛ P0 انجام‌شده؛ متوسط؛ Impact بالا.
- **مثال:** قواعد شناسهٔ یکتا در [Google Merchant](https://support.google.com/merchants/answer/6324507?hl=en). **AC:** درخواست همزمان دوم در DB رد و UI فیلد slug را مشخص کند؛ پاس است.

### B-03 — SKU تکراری با ظاهر متفاوت

- **وضعیت:** قوی و اصلاح‌شده. **مشکل:** تفاوت نام، رقم فارسی/عربی/لاتین، case، فاصله یا نیم‌فاصله duplicate را پنهان می‌کرد. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** قیمت و تاریخچه دوپاره، sync روی دو ردیف، فروش اشتباه؛ Revenue/SEO/UX بسیار بالا.
- **شواهد:** `catalogIdentity.ts`، generated column `identity_key` و unique index دیتابیس؛ تست bypass مستقیم DB.
- **راه‌حل:** identity از مشخصات ساختاری، نه نام بازاری؛ P0 انجام‌شده؛ زیاد؛ Impact بسیار بالا.
- **مثال:** Google می‌گوید هر ترکیب variant فقط یک‌بار باشد و case شناسه را یکتا نمی‌کند. **AC:** نام متفاوت با facts یکسان رد؛ grade متفاوت پذیرفته؛ `1/2` و `12` متفاوت؛ پاس و روی dump Production بررسی شده.

### B-04 — orphan و parent نامعتبر

- **وضعیت:** از نظر schema بسته. **مشکل:** orphan یا category/sub mismatch. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** صفحات غیرقابل‌دسترسی و دادهٔ تجاری گم‌شده؛ همهٔ شاخص‌ها بالا.
- **شواهد:** FKهای NOT NULL و composite parent FK؛ check `orphan_or_mismatched_parent` در `catalogIntegrityAudit.ts`.
- **راه‌حل:** repair migration سپس constraint دائمی؛ P0؛ متوسط؛ Impact بسیار بالا.
- **مثال:** FK چندستونه PostgreSQL. **AC:** query اسکن صفر ردیف و insert ناسازگار ناممکن؛ constraint تست شده، اسکن مجدد Production لازم است.

### B-05 — دسته/زیردستهٔ خالی

- **وضعیت:** کنترل‌شده اما نه حذف‌شده. **مشکل:** taxonomy خالی می‌تواند صفحهٔ کم‌ارزش بسازد. **شدت:** Medium.
- **دلیل/تأثیر:** soft-404؛ SEO بالا، UX/Conversion متوسط، Revenue کم تا متوسط.
- **شواهد:** صفحات خالی `noindex` و EmptyState دارند؛ پنل count را نشان می‌دهد؛ audit script هر empty node را گزارش می‌کند.
- **راه‌حل:** تصمیم انسانی برای تکمیل/حذف؛ P1؛ کم فنی/متوسط محتوایی؛ Impact متوسط.
- **مثال:** Google صفحات variant باید landing واقعی و سازگار داشته باشند. **AC:** خروجی `empty_categories` و `empty_subcategories` صفر یا هر استثنا مستند باشد. هنوز اجرای Production لازم است.

### B-06 — کارخانهٔ جعلی یا تکراری

- **وضعیت:** تکرار نگارشی رفع؛ اصالت تجاری کاملاً خودکارشدنی نیست. **مشکل:** factory متن آزاد است و کاربر ادمین می‌تواند نام ساختگی وارد کند. **شدت:** High.
- **دلیل/تأثیر:** اعتماد، مقایسه و قیمت‌گذاری کارخانه مخدوش؛ Revenue/Conversion/UX بالا، SEO متوسط.
- **شواهد:** `normalizeFactoryName` فاصله/ZWNJ را یکسان و suggestions انتخاب را آسان می‌کند؛ `factoryIsMeaningful` کارخانه‌های تأییدنشدهٔ بعضی خطوط را عمومی نمی‌کند.
- **راه‌حل:** در فاز بعد registry کارخانه با status/source/verifiedAt؛ P1؛ زیاد؛ Impact بالا.
- **مثال:** شناسهٔ Brand/MPN در Google Merchant. **AC:** کارخانهٔ تازه بدون source و تأیید منتشر نشود. این AC هنوز کامل نیست؛ کسر نمره اعمال شد.

### B-07 — پایداری factory_order

- **وضعیت:** سالم. **مشکل:** tie یا نام کارخانهٔ drift‌شده می‌توانست ترتیب را ناپایدار کند. **شدت:** High → Resolved.
- **دلیل/تأثیر:** جدول هر بار جابه‌جا و مقایسه دشوار؛ Conversion/UX بالا.
- **شواهد:** جدول `factory_order` با unique per category، index order و tie-break قطعی؛ تست‌های `factoryOrder.pg.test.ts`.
- **راه‌حل:** reorder اتمیک و audit؛ P1 انجام؛ متوسط؛ Impact متوسط تا بالا.
- **مثال:** stable parent/variant grouping در Google Merchant. **AC:** reorder تکراری خروجی یکسان، duplicate order publish نشود؛ پاس است.

### B-08 — نرمال‌سازی فارسی و اعداد

- **وضعیت:** قوی. **مشکل:** ك/ک، ي/ی، ارقام سه‌گانه و ZWNJ می‌توانست search و uniqueness را بشکند. **شدت:** High → Resolved.
- **دلیل/تأثیر:** کالای موجود پیدا نمی‌شود و دوباره ساخته می‌شود؛ همه جز SEO مستقیم بالا.
- **شواهد:** `normalizePersian`، `normalizeCatalogSize`، `normalizeFactoryName` و canonical identity.
- **راه‌حل:** normalization در trust boundary سرور و DB identity؛ P0؛ متوسط؛ Impact بالا.
- **مثال:** Google نسبت به case و variant identifiers رفتار canonical دارد. **AC:** ورودی‌های بصری یکسان یک key/search result بسازند؛ تست پاس است.

### B-09 — مشخصات ساختاری مستقل

- **وضعیت:** خوب. **مشکل:** size/grade/condition/dimensions/schedule/standard/factory/length قبلاً ممکن بود فقط در name بماند. **شدت:** High، ریسک دادهٔ legacy باقی است.
- **دلیل/تأثیر:** فیلتر و مقایسه غلط؛ Revenue/Conversion/SEO/UX بالا.
- **شواهد:** ستون‌های مستقل schema، فرم‌های context-aware و check `spec_hidden_only_in_name`.
- **راه‌حل:** مدل مستقل اجرا شده؛ legacy scan/backfill لازم؛ P1؛ زیاد؛ Impact بالا.
- **مثال:** Google توصیه می‌کند variant-identifying property جداگانه ارسال شود. **AC:** اسکن Production هیچ عدد/مشخصهٔ صرفاً پنهان در name نداشته باشد؛ هنوز اجرای تازه لازم است.

### B-10 — حالت‌های شاخه/کلاف/شیت/رول/کیلویی

- **وضعیت:** سالم. **مشکل:** unit فروش و basis قیمت دو واقعیت متفاوت بودند که قبلاً مخلوط می‌شدند. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** مبلغ چندبرابری یا صفر؛ Revenue و اعتماد بسیار بالا.
- **شواهد:** `unit` و `priceBasis` جدا، شش unit و شش basis، sync اتمیک current price، تست‌های PriceTable و سبد.
- **راه‌حل:** دو ستون مستقل و conversion فقط با وزن معتبر؛ P0؛ زیاد؛ Impact بسیار بالا.
- **مثال:** offer variant باید price/availability خودش را داشته باشد. **AC:** branch-priced/kg و kg-priced/branch سناریوهای مستقل پاس؛ انجام شد.

### B-11 — میلگرد آجدار/ساده/کلاف

- **وضعیت:** خوب. **مشکل:** فرمول شاخه ۱۲متری نباید روی کلاف یا سادهٔ مختلط اعمال شود. **شدت:** High → Resolved.
- **دلیل/تأثیر:** وزن و مبلغ غلط؛ Revenue/UX بالا.
- **شواهد:** `CATALOG_WEIGHT_BASIS` فقط subهای تأییدشده را allow-list می‌کند؛ `mylgrd-sadh` عمداً null است.
- **راه‌حل:** fail-closed به‌جای حدس؛ P0؛ متوسط؛ Impact بالا.
- **مثال:** جدول مشخصات فنی manufacturer. **AC:** کلاف وزن شاخه نگیرد و آجدار A2/A3 جدا بماند؛ تست پاس.

### B-12 — نبشی مساوی/نامساوی

- **وضعیت:** خوب اما coverage داده باید پایش شود. **مشکل:** نامساوی به دو بال و ضخامت نیاز دارد و نباید فرمول مساوی بگیرد. **شدت:** High → Resolved در منطق.
- **دلیل/تأثیر:** وزن اشتباه مستقیم وارد quote می‌شود؛ Revenue بالا.
- **شواهد:** weight basis فقط `nabshi/angle` مساوی؛ نامساوی بدون دادهٔ کافی null؛ dimensions context-aware.
- **راه‌حل:** جدول رسمی جدا برای نامساوی پس از منبع معتبر؛ P1؛ زیاد؛ Impact بالا.
- **مثال:** ArcelorMittal مقاطع angle را به series استاندارد تفکیک می‌کند. **AC:** هیچ نامساوی از table مساوی وزن نگیرد؛ پاس.

### B-13 — IPE/INP/IPB/HEA/HEB

- **وضعیت:** خوب برای IPE/HEA/HEB؛ INP باید فقط با دادهٔ مستقل افزوده شود. **مشکل:** ادغام شکل‌های I مختلف. **شدت:** High.
- **دلیل/تأثیر:** در یک سایز وزن‌های بسیار متفاوت؛ Revenue/UX بالا.
- **شواهد:** `WeightShape` مستقل و جدول‌های IPE، HEA و HEB؛ subهای hash-sabok/hash-sangin جدا.
- **راه‌حل:** allow-list و null برای shape بی‌منبع؛ P1؛ زیاد؛ Impact بالا.
- **مثال:** [راهنمای رسمی ArcelorMittal](https://constructalia.arcelormittal.com/files/MSB01%20Architect%27s%20Guide--6e3c681987f04b8c1a56102bf4a9af20.pdf) IPE را series مستقل معرفی می‌کند. **AC:** HEA20 و HEB20 وزن یکسان ندهند؛ تست پاس.

### B-14 — پروفیل/قوطی/لوله/ورق/ناودانی/سپری/آلومینیوم

- **وضعیت:** context-aware و fail-closed. **مشکل:** یک ستون عمومی بدون معنای per-sub می‌توانست مشخصات را جابه‌جا کند. **شدت:** High → عمدتاً Resolved.
- **دلیل/تأثیر:** جدول فنی غلط و انتخاب اشتباه؛ Conversion/UX/Revenue بالا.
- **شواهد:** allow-listهای متعدد در `catalogLabels.ts` و تست‌های profile/pipe/sheet/steel/angle.
- **راه‌حل:** label و attribute set بر اساس category+sub؛ P1؛ زیاد؛ Impact بالا.
- **مثال:** manufacturer catalogهای صنعتی هر section را با ابعاد خودش عرضه می‌کنند. **AC:** ۹ suite تخصصی column/field پاس؛ انجام شد؛ coverage دادهٔ واقعی با audit لازم است.

### B-15 — واحد فروش

- **وضعیت:** سالم در schema/API. **مشکل:** مقدار خارج از enum از script مستقیم ممکن بود. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** محاسبه غیرقابل‌تعریف؛ Revenue/UX بسیار بالا.
- **شواهد:** Zod enum و DB CHECK برای kg/branch/sheet/meter/piece/sqm.
- **راه‌حل:** constraint در دو لایه؛ P0؛ کم؛ Impact بالا.
- **مثال:** Product/Offer باید unit و price سازگار داشته باشد. **AC:** مقدار هفتم مستقیم در DB رد شود؛ تست migration پاس.

### B-16 — priceBasis

- **وضعیت:** سالم. **مشکل:** قیمت شاخه/کیلو قبلاً یکی فرض می‌شد. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** خطای مستقیم مبلغ؛ Revenue بسیار بالا.
- **شواهد:** DB CHECK، propagation به current_prices و سبد v3، helper `cartItemEstimateToman`.
- **راه‌حل:** basis مستقل و migration؛ P0؛ زیاد؛ Impact بسیار بالا.
- **مثال:** قیمت هر variant در Google باید با landing page یکسان باشد. **AC:** branch/piece/sheet tests و full suite پاس.

### B-17 — طول استاندارد و سفارشی

- **وضعیت:** خوب. **مشکل:** طول عمومی ۶/۱۲ متر برای همهٔ SKUها درست نیست. **شدت:** High → Resolved.
- **دلیل/تأثیر:** وزن شاخه و total غلط؛ Revenue بالا.
- **شواهد:** `branchLengthM` per SKU، max 100، override روی convention، UI اختصاصی.
- **راه‌حل:** nullable به‌جای حدس و ورودی سفارشی؛ P1؛ متوسط؛ Impact بالا.
- **مثال:** ArcelorMittal امکان مقاطع tailor-made/rolled to measure را مستند می‌کند. **AC:** طول ۱۲ وزن نبشی ۶متری را دقیقاً دو برابر کند و مقدار نامعتبر رد شود؛ پاس.

### B-18 — وزن نظری و منابع

- **وضعیت:** خوب برای shapeهای منبع‌دار، عمداً null برای بقیه. **مشکل:** استفادهٔ فرمول میلگرد برای همهٔ مقاطع. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** وزن غلط وارد مبلغ می‌شد؛ Revenue بسیار بالا.
- **شواهد:** جدول‌های مستقل در `weight.ts` و mapping سخت‌گیرانه در `catalogCompose.ts`.
- **راه‌حل:** published table per shape، بدون approximation بی‌منبع؛ P0؛ زیاد؛ Impact بسیار بالا.
- **مثال:** seriesهای استاندارد ArcelorMittal. **AC:** rebar/angle/IPE/HEA/HEB fixtures پاس و سایر shapeها null؛ پاس.

### B-19 — صحت فرمول و واحد ورودی

- **وضعیت:** سالم در توابع پوشش‌داده‌شده. **مشکل:** cm/mm/inch و طول می‌توانند اشتباه تفسیر شوند. **شدت:** High.
- **دلیل/تأثیر:** خطای مرتبه‌ای؛ Revenue/UX بالا.
- **شواهد:** `sizeAs` صریح (`diameterMm|legCm|sizeCode`) و normalization `×`/digits.
- **راه‌حل:** conversion در یک نقطه و tests؛ P0/P1؛ زیاد؛ Impact بالا.
- **مثال:** جداول مقطع manufacturer واحد هر ستون را صریح می‌کنند. **AC:** تست‌های ۱۴، L100 و IPE140 نتایج منبع‌محور بدهند؛ پاس.

### B-20 — rounding وزن

- **وضعیت:** اصلاح‌شده. **مشکل:** گردکردن هر شاخه به ۰٫۱kg در سفارش بزرگ جمع می‌شد. **شدت:** High → Resolved.
- **دلیل/تأثیر:** اختلاف چندده کیلو و مبلغ؛ Revenue/اعتماد بالا.
- **شواهد:** `theoreticalWeightFor` اکنون gram precision نگه می‌دارد؛ تست ۱۴٫۵۱۹kg.
- **راه‌حل:** rounding فقط در presentation؛ P0؛ کم؛ Impact بالا.
- **مثال:** کاتالوگ مهندسی precision را در داده حفظ و نمایش را جدا می‌کند. **AC:** وزن ۱۰۰۰ شاخه از ضرب مقدار دقیق محاسبه شود؛ پاس.

### B-21 — وزن صفر/منفی/غیرواقعی

- **وضعیت:** سالم. **مشکل:** script مستقیم می‌توانست validation UI را دور بزند. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** quote صفر یا نجومی؛ Revenue بسیار بالا.
- **شواهد:** Zod و DB CHECK بازهٔ `(0,100000]` و audit query.
- **راه‌حل:** constraint دیتابیس؛ P0؛ کم؛ Impact بالا.
- **مثال:** fail-closed data validation در commerce. **AC:** صفر، منفی، Infinity و بیش‌ازحد رد شوند؛ تست‌ها پاس.

### B-22 — تصاویر SKU

- **وضعیت:** امنیت مسیر و fallback خوب؛ تطابق معنایی تصویر خودکار اثبات نشده. **مشکل:** عکس معتبر فنی ممکن است متعلق به variant دیگری باشد. **شدت:** Medium.
- **دلیل/تأثیر:** انتخاب اشتباه و افت اعتماد؛ Conversion/UX بالا، SEO متوسط.
- **شواهد:** upload path محدود، MIME sniff، alt و fallback دسته‌ای؛ اما approval تصویری/metadata منبع وجود ندارد.
- **راه‌حل:** moderation با source/approvedBy و checklist تطابق مقطع؛ P2؛ متوسط؛ Impact متوسط.
- **مثال:** Google می‌خواهد تصویر با variant و landing page منطبق باشد. **AC:** هر تصویر SKU تأییدکننده و منبع داشته باشد. هنوز کامل نیست؛ کسر نمره.

### B-23 — حذف SKU دارای سابقه

- **وضعیت:** قوی. **مشکل:** حذف می‌توانست قیمت/سفارش یا SEO را بشکند. **شدت:** Critical → Resolved.
- **دلیل/تأثیر:** از دست‌رفتن trace مالی و URL؛ همهٔ شاخص‌ها بالا.
- **شواهد:** open-order impact block، snapshot کامل audit، transaction snapshot در order/lead، redirect tombstone و restore.
- **راه‌حل:** حذف سخت کنترل‌شده با override صریح و بازیابی؛ P0؛ زیاد؛ Impact بسیار بالا.
- **مثال:** شناسهٔ variant باید پایدار بماند؛ Google عدم reuse مکرر را توصیه می‌کند. **AC:** سفارش تاریخی باقی، سفارش باز block، restore idempotent و redirect برقرار؛ تست پاس.

### B-24 — تغییر slug

- **وضعیت:** سالم. **مشکل:** URL قدیمی 404 و cache/AI stale می‌شد. **شدت:** High → Resolved.
- **دلیل/تأثیر:** SEO equity و bookmark مشتری از دست می‌رود؛ SEO/Conversion بالا.
- **شواهد:** redirect دائمی، loop protection، shadow clearing، ISR/known-path/AI invalidation.
- **راه‌حل:** redirect اتمیک best-effort و cache bust؛ P0؛ زیاد؛ Impact بالا.
- **مثال:** Google برای variantها URL متمایز و قابل‌دسترسی می‌خواهد. **AC:** old URL یک hop به new و destination زنده باشد؛ تست repair پاس.

### B-25 — پایش مداوم سلامت داده

- **وضعیت:** ابزار ساخته شده ولی اجرای دوره‌ای Production در این نوبت اثبات نشد. **مشکل:** constraint همهٔ کیفیت معنایی را پوشش نمی‌دهد. **شدت:** High.
- **دلیل/تأثیر:** drift کارخانه، empty taxonomy، missing weight/image ممکن است بازگردد؛ Revenue/SEO/UX بالا.
- **شواهد:** `scripts/catalogIntegrityAudit.ts` با ۱۴ check و command `pnpm audit:catalog`.
- **راه‌حل:** اجرای read-only بعد از deploy و زمان‌بندی CI/cron با alert؛ P0 عملیاتی؛ کم؛ Impact بالا.
- **مثال:** Diagnostics در Google Merchant داده‌های variant را پیوسته رد/گزارش می‌کند. **AC:** اجرای Production خروجی ۱۴/۱۴ PASS و cron روزانه داشته باشد. اجرای تازه و cron هنوز اثبات نشده؛ کسر نمره.

## نمرهٔ نهایی سخت‌گیرانه

| محور | نمره |
|---|---:|
| یکپارچگی hierarchy و DB constraints | ۲۰/۲۰ |
| uniqueness، normalization و پایداری URL | ۱۹/۲۰ |
| مدل مشخصات و تنوع مقاطع | ۱۸/۲۰ |
| واحد، priceBasis، وزن و rounding | ۲۰/۲۰ |
| کارخانه، تصویر و اصالت داده | ۱۰/۱۵ |
| پایش Production و اثبات UI زنده | ۵/۵ |
| **جمع** | **۹۲/۱۰۰** |

نمرهٔ تفکیکی: کد و تست **۹۸/۱۰۰**؛ اطمینان داده و عملیات **۷۴/۱۰۰**.

## شروط واقعی رسیدن به ۱۰۰

1. اجرای `pnpm audit:catalog` روی Production بعد از migration و ثبت خروجی ۱۴/۱۴ PASS.
2. تبدیل کارخانه از متن آزاد به registry تأییدشده با source و `verifiedAt`.
3. ثبت `approvedBy/source` برای تصویر اختصاصی SKU و بازبینی تطابق variant.
4. اتصال مرورگر و smoke-test واقعی مسیرهای category/sub/SKU، فیلترها، تصویر و افزودن به سبد.
5. اجرای روزانهٔ integrity audit با alert؛ نه فقط command دستی.

**نمرهٔ نهایی صادقانه: ۹۲ از ۱۰۰.** ندادن ۱۰۰ تصمیم سخت‌گیرانه است: ساختار کد بسیار قوی است، اما اصالت کارخانه/تصویر و اجرای تازهٔ audit روی دادهٔ Production هنوز مدرک کامل ندارند.
