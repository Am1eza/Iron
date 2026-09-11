# پشتیبان‌گیری آهن‌تایم

## وضعیت فعلی

| | |
|---|---|
| زمان‌بندی | هر شب ۰۳:۰۰ (systemd timer `ahantime-backup.timer`، با تأخیر تصادفی تا ۱۵ دقیقه) |
| اسکریپت | `/usr/local/sbin/ahantime-db-backup.sh` |
| نسخهٔ محلی | `/var/backups/ahantime/ahantime-<تاریخ>.sql.gz` — نگهداری ۱۴ روز |
| نسخهٔ رمزگذاری‌شده | مخزن restic — نگهداری ۱۴ روزانه + ۸ هفتگی |
| حجم پایگاه‌داده | حدود ۵۰۰ کیلوبایت فشرده |
| کلیدها | `/etc/ahantime-backup.env` (فقط root، `chmod 600`) |

## ⚠️ کاری که فقط شما می‌توانید انجام دهید

**در حال حاضر هر دو نسخهٔ پشتیبان روی همین سرور هستند.** یعنی اگر این سرور از دست
برود (خرابی دیسک، مشکل ارائه‌دهنده، خطای انسانی)، هر دو نسخه با آن از بین می‌روند.

کل خط لوله ساخته، اجرا و **تست بازیابی** شده است؛ تنها چیزی که مانده یک مقصد
بیرونی است. برای بستن این ریسک:

۱. یک فضای ذخیره‌سازی سازگار با S3 تهیه کنید. **حتماً تأیید کنید که از داخل ایران
   در دسترس است** — ارائه‌دهندهٔ ایرانی (آروان، لیارا و مشابه) از این نظر مطمئن‌تر
   از سرویس‌های خارجی است. حجم مورد نیاز ناچیز است (زیر ۱ گیگابایت برای سال‌ها).

۲. سه خط زیر را در `/etc/ahantime-backup.env` قرار دهید:

```
RESTIC_REPOSITORY=s3:https://<آدرس-سرویس>/<نام-باکت>
AWS_ACCESS_KEY_ID=<کلید دسترسی>
AWS_SECRET_ACCESS_KEY=<کلید مخفی>
```

۳. مخزن جدید را یک‌بار بسازید و تست کنید:

```bash
set -a; . /etc/ahantime-backup.env; set +a
restic init
/usr/local/sbin/ahantime-db-backup.sh
restic snapshots
```

از آن شب به بعد خودکار ادامه پیدا می‌کند.

## 🔑 هشدار حیاتی دربارهٔ رمز

`RESTIC_PASSWORD` داخل `/etc/ahantime-backup.env` تمام مخزن را رمزگذاری می‌کند.
**بدون آن هیچ نسخهٔ پشتیبانی قابل بازیابی نیست — حتی توسط ما.**

یک نسخه از این رمز را جایی خارج از این سرور نگه دارید (مدیر رمز عبور، کاغذ در
گاوصندوق). اگر سرور را از دست بدهید و رمز هم فقط روی همان سرور بوده باشد،
نسخه‌های پشتیبان رمزگذاری‌شدهٔ سالم را دارید و هیچ‌وقت نمی‌توانید بازشان کنید.

## تست بازیابی

انجام‌شده در ۱۴۰۵/۰۵/۰۹: از مخزن restic بازیابی شد، در یک پایگاه‌دادهٔ موقت
بارگذاری شد، و تعداد رکوردها با نسخهٔ زنده مقایسه شد — `users`, `leads`,
`proformas`, `skus`, `current_prices`, `articles`, `warehouse_items` همگی دقیقاً
برابر بودند.

**این تست را هر چند ماه یک‌بار تکرار کنید.** پشتیبانی که بازیابی‌اش تست نشده،
پشتیبان نیست — فقط یک فرض است.

```bash
set -a; . /etc/ahantime-backup.env; set +a
WORK=$(mktemp -d)
restic restore latest --tag ahantime-db --target "$WORK"
DUMP=$(find "$WORK" -name '*.sql.gz' | head -1)
cd /opt/ahantime
docker compose exec -T db psql -U ahantime -d postgres -c "DROP DATABASE IF EXISTS restoretest;" -c "CREATE DATABASE restoretest;"
gunzip -c "$DUMP" | docker compose exec -T db psql -U ahantime -d restoretest -q
docker compose exec -T db psql -U ahantime -d restoretest -tAc "select count(*) from leads;"
docker compose exec -T db psql -U ahantime -d postgres -c "DROP DATABASE restoretest;"
rm -rf "$WORK"
```

## تست بازیابی — فایل‌های آپلودشده (I-213، ۲۰۲۶-۰۹-۱۱)

تست بالا فقط پایگاه‌داده را بازیابی می‌کند. تصویر SKU/دسته، کاور مقاله و لوگوی
سربرگ فقط به‌صورت یک مسیر (`imageUrl`/`coverUrl`/...) در همان دیتابیس ذخیره
می‌شوند — خودِ فایل‌ها در volume جدای `ahantime-uploads` هستند. بازیابی پایگاه‌داده
بدون این مرحله یعنی هر تصویر یک لینک شکسته است.

**تست منطق این مرحله (نه روی داده/سرور واقعی) در ۲۰۲۶-۰۹-۱۱ روی یک مخزن restic
یکبارمصرف محلی اجرا شد:** یک uploads دلخواه backup، forget/prune و
snapshot-verify شد (دقیقاً همان دستورات خودِ `ahantime-db-backup.sh`)، سپس با
`restic restore` به یک مسیر جدا بازگردانده و با `diff` **بایت‌به‌بایت با فایل
اصلی یکسان** تأیید شد؛ یک تلاش دوم با رمز عبور غلط، شکست را هم درست نشان داد
(exit ناموفق، نه سکوت). این اثبات می‌کند مکانیسم restic درست کار می‌کند؛ اجرای
واقعی روی سرور Production و مخزن واقعی هنوز جداگانه لازم است — **این تست را هم
هر چند ماه یک‌بار، هم‌زمان با تست بالا، روی سرور واقعی تکرار کنید**:

```bash
set -a; . /etc/ahantime-backup.env; set +a
WORK=$(mktemp -d)
restic restore latest --tag ahantime-uploads --target "$WORK"
find "$WORK" -type f | wc -l          # باید با تعداد فایل‌های واقعی uploads نزدیک باشد
# یک فایل دلخواه را با نسخهٔ زندهٔ روی دیسک مقایسه کنید:
diff "$WORK$(find "$WORK" -name '*.jpg' | head -1 | sed "s#^$WORK##")" \
     "/var/lib/docker/volumes/ahantime_uploads/_data/$(basename "$(find "$WORK" -name '*.jpg' | head -1)")"
rm -rf "$WORK"
```

## طراحی

نسخهٔ محلی **اول** گرفته و نگهداری می‌شود، بعد نسخهٔ بیرونی. اگر ارسال بیرونی
شکست بخورد، اسکریپت با خطا خارج می‌شود اما نسخهٔ محلی همان شب سالم سر جایش است.
ترتیب عمدی است: خرابی شبکه نباید پشتیبان امشب را از بین ببرد.

کلیدهای پشتیبان‌گیری عمداً در `/etc/ahantime-backup.env` هستند و نه در
`/opt/ahantime/.env` — چون آن فایل به‌طور کامل به کانتینر وب پاس داده می‌شود و
کلید پشتیبان هیچ کاری در محیط اپلیکیشن ندارد.

## بازیابی کامل در شرایط اضطراری

**هر دو تگ لازم است — فقط پایگاه‌داده کافی نیست (I-213).** بازیابی تنها
`ahantime-db` سایت را بالا می‌آورد اما هر تصویر SKU/دسته/مقاله/لوگو را به یک
لینک شکسته تبدیل می‌کند، چون فایل‌های واقعی در تگ جدای `ahantime-uploads`اند.

```bash
set -a; . /etc/ahantime-backup.env; set +a
restic snapshots                                  # کدام نسخه؟ (هر دو تگ را ببینید)
restic restore <شناسهٔ db>       --tag ahantime-db      --target /tmp/rec-db
restic restore <شناسهٔ uploads> --tag ahantime-uploads --target /tmp/rec-uploads
cd /opt/ahantime
docker compose up -d db
gunzip -c /tmp/rec-db/var/backups/ahantime/*.sql.gz | docker compose exec -T db psql -U ahantime -d ahantime
# uploads یک named volume است (I-214) — کپی مستقیم به آن، نه به مسیر کانتینر:
rsync -a /tmp/rec-uploads/var/lib/docker/volumes/ahantime_uploads/_data/ \
  /var/lib/docker/volumes/ahantime_uploads/_data/
docker compose up -d
```
