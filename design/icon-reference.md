# Ahantime icon system — naming & RTL reference

Grid 24 · live area 3–21 · round caps + round joins · `fill="none"` · body `currentColor`.
134 icons: 12 categories, 33 sub-category glyphs, 89 general UI.

## Stroke — optical, never scaled

| Display | Rendered stroke | `stroke-width` (user units) | Master |
|---|---|---|---|
| 16 px | 1.25 | 1.875 | micro |
| 20 px | 1.50 | 1.800 | micro |
| 24 px | 1.75 | 1.750 | base |
| 32 px | 2.00 | 1.500 | base |

`stroke-width = target × 24 ÷ displaySize`. Set it on a container: it inherits
into every icon, `<use>` instances included, so one rule governs a whole row.

## Micro masters

Product profiles carry a second master for 16 and 20 px: the section's wall
thickness is dropped and the profile becomes its own centreline — I, H, L, U, T.
Same apparent stroke weight, unambiguous silhouettes in a dense menu.

**Rebar is the one documented exception.** A skeletal rebar is a single line, so
`cat-rebar`, `sub-rebar` and `sub-plain-bar` keep the closed bar at every size
and only drop from three ribs to two.

## RTL mirroring

```css
[dir="rtl"] .icon--rtl { transform: scaleX(-1); }
```

Mirrored (17): `cat-etesalat` · `sub-zprofile` · `sub-elbow` · `chevron-start` · `chevron-end` · `arrow-start` · `arrow-end` · `external` · `truck` · `news` · `login` · `logout` · `edit` · `copy` · `share` · `play` · `toggle`

Never mirrored: every steel section, every channel glyph, `search` `cart`
`heart` `bell` `user` `phone` `location` `weight` `calculator` `check` `home`,
every status icon, and `arrow-up` / `arrow-down` — price direction is vertical,
so its meaning is not reading order. `send` is a paper plane precisely so that
it needs no mirror (the reason already recorded in `icons.tsx`).

## Tier 1 — categories (12)

| id | fa | en | slug | RTL | micro |
|---|---|---|---|---|---|
| `cat-rebar` | میلگرد | Rebar | `rebar` | – | ✓ |
| `cat-ibeam` | تیرآهن | I-beam | `ibeam` | – | ✓ |
| `cat-profile` | پروفیل و قوطی | Hollow profile | `profile` | – | ✓ |
| `cat-sheet` | ورق | Sheet / plate | `sheet` + `varagh-garm` `varagh-sard` `varagh-steel` | – | ✓ |
| `cat-angle-channel` | نبشی و ناودانی | Angle & channel | `angle-channel` | – | ✓ |
| `cat-pipe` | لوله | Pipe | `pipe` | – | ✓ |
| `cat-steel` | استیل | Stainless / billet | `steel` | – | ✓ |
| `cat-felezat-rangi` | فلزات رنگی | Non-ferrous | `felezat-rangi` | – | ✓ |
| `cat-wire` | کلاف و مفتول | Wire & coil | `wire` | – | ✓ |
| `cat-shiralat` | شیرآلات صنعتی | Industrial valves | `shiralat-sanati` | – | ✓ |
| `cat-etesalat` | اتصالات فلزی | Fittings | `etesalat-felezi` | **✓** | ✓ |
| `cat-flanj` | فلنج و اتصالات | Flanges | `flanj-va-etesalat` | – | ✓ |

## Tier 2 — sub-category glyphs (33)

| id | fa | en | glyph | RTL | micro |
|---|---|---|---|---|---|
| `sub-plate` | ورق (تخته) | Plate stack | `plate` | – | ✓ |
| `sub-plate-coated` | ورق پوشش‌دار | Coated plate | `plateCoated` | – | ✓ |
| `sub-checkered` | ورق آجدار | Checkered plate | `checkered` | – | ✓ |
| `sub-corrugated` | ورق کرکره‌ای | Corrugated | `corrugated` | – | ✓ |
| `sub-panel` | پانل ساندویچی | Sandwich panel | `panel` | – | ✓ |
| `sub-deck` | عرشه فولادی | Composite deck | `deck` | – | ✓ |
| `sub-strip` | تسمه | Flat strip | `strip` | – | ✓ |
| `sub-grating` | گریتینگ | Grating | `grating` | – | ✓ |
| `sub-perforated` | ورق پانچ | Perforated | `perforated` | – | ✓ |
| `sub-pipe` | لوله | Pipe | `pipe` | – | ✓ |
| `sub-pipe-spiral` | لوله اسپیرال | Spiral-welded pipe | `pipeSpiral` | – | ✓ |
| `sub-box` | قوطی | Box section | `box` | – | ✓ |
| `sub-square-bar` | چهارپهلو | Solid square bar | `squareBar` | – | ✓ |
| `sub-zprofile` | پروفیل Z | Z profile | `zprofile` | **✓** | ✓ |
| `sub-angle` | نبشی | Angle (L) | `angle` | – | ✓ |
| `sub-channel` | ناودانی | Channel (U) | `channel` | – | ✓ |
| `sub-tee` | سپری | Tee | `tee` | – | ✓ |
| `sub-beam` | تیرآهن IPE | I-beam | `beam` | – | ✓ |
| `sub-beam-h` | هاش (HEA/HEB) | H-beam | `beamH` | – | ✓ |
| `sub-castellated` | لانه‌زنبوری | Castellated | `castellated` | – | ✓ |
| `sub-rebar` | میلگرد آجدار | Ribbed rebar | `rebar` | – | ✓ |
| `sub-plain-bar` | میلگرد ساده | Plain round bar | `plainBar` | – | ✓ |
| `sub-coupler` | کوپلر | Coupler | `coupler` | – | ✓ |
| `sub-coil` | کلاف | Coil | `coil` | – | ✓ |
| `sub-wire` | مفتول | Wire | `wire` | – | ✓ |
| `sub-mesh` | توری و مش | Mesh | `mesh` | – | ✓ |
| `sub-flange` | فلنج | Flange | `flange` | – | ✓ |
| `sub-ring` | رینگ و بوشن | Ring / sleeve | `ring` | – | ✓ |
| `sub-spring` | فنر | Spring | `spring` | – | ✓ |
| `sub-billet` | شمش فولادی | Billet | `billet` | – | ✓ |
| `sub-ingot` | شمش غیرآهنی | Ingot stack | `ingot` | – | ✓ |
| `sub-valve` | شیر صنعتی | Valve | `valve` | – | ✓ |
| `sub-elbow` | زانو و اتصال | Elbow fitting | `elbow` | **✓** | ✓ |

## Tier 3 — general UI (89)

| id | fa | en | group | RTL | micro |
|---|---|---|---|---|---|
| `menu` | منو | Menu | nav | – | – |
| `close` | بستن | Close | nav | – | – |
| `search` | جست‌وجو | Search | nav | – | – |
| `chevron-down` | باز کردن | Chevron down | nav | – | – |
| `chevron-up` | بستن | Chevron up | nav | – | – |
| `chevron-start` | قبلی | Chevron start | nav | **✓** | – |
| `chevron-end` | بعدی | Chevron end | nav | **✓** | – |
| `arrow-start` | بازگشت | Arrow start | nav | **✓** | – |
| `arrow-end` | ادامه | Arrow end | nav | **✓** | – |
| `arrow-up` | رشد قیمت | Arrow up | data | – | – |
| `arrow-down` | کاهش قیمت | Arrow down | data | – | – |
| `home` | خانه | Home | nav | – | – |
| `grid` | نمای شبکه | Grid view | nav | – | – |
| `list` | نمای فهرست | List view | nav | – | – |
| `filter` | فیلتر | Filter | nav | – | – |
| `sort` | مرتب‌سازی | Sort | nav | – | – |
| `more` | بیشتر | More | nav | – | – |
| `external` | پیوند بیرونی | External link | nav | **✓** | – |
| `globe` | زبان | Language | nav | – | – |
| `cart` | سبد استعلام | Quote cart | commerce | – | – |
| `tag` | قیمت | Price tag | commerce | – | – |
| `doc-request` | پیش‌فاکتور | Quote document | commerce | – | – |
| `calculator` | ماشین‌حساب | Calculator | tools | – | – |
| `weight` | وزن‌سنج | Weight scale | tools | – | – |
| `blueprint` | برآورد پروژه | Blueprint / ruler | tools | – | – |
| `warehouse` | انبار مشتریان | Warehouse | commerce | – | – |
| `truck` | حمل و ارسال | Delivery truck | commerce | **✓** | – |
| `delivery-clock` | زمان تحویل | Delivery time | commerce | – | – |
| `factory` | کارخانه | Factory / mill | company | – | – |
| `partnership` | همکاری با ما | Partnership | company | – | – |
| `news` | اخبار بازار | News | company | **✓** | – |
| `users` | مشتریان | Customers | company | – | – |
| `bank` | بورس کالا | Exchange | data | – | – |
| `currency` | طلا و ارز | Currency | data | – | – |
| `coin` | سکه و طلا | Gold coin | data | – | – |
| `trending` | روند بازار | Trending | data | – | – |
| `chart` | نمودار قیمت | Price chart | data | – | – |
| `user` | حساب کاربری | User | account | – | – |
| `login` | ورود | Login | account | **✓** | – |
| `logout` | خروج | Logout | account | **✓** | – |
| `bell` | هشدار قیمت | Price alert | account | – | – |
| `heart` | علاقه‌مندی | Favorite | account | – | – |
| `star` | امتیاز | Star | account | – | – |
| `medal` | باشگاه مشتریان | Club medal | account | – | – |
| `settings` | تنظیمات | Settings | account | – | – |
| `shield` | ضمانت | Guarantee | account | – | – |
| `plus` | افزودن | Add | action | – | – |
| `minus` | کاستن | Remove | action | – | – |
| `check` | تأیید | Check | action | – | – |
| `edit` | ویرایش | Edit | action | **✓** | – |
| `trash` | حذف | Delete | action | – | – |
| `copy` | کپی | Copy | action | **✓** | – |
| `refresh` | بازخوانی | Refresh | action | – | – |
| `download` | دانلود | Download | action | – | – |
| `print` | چاپ | Print | action | – | – |
| `file-xls` | خروجی اکسل | Spreadsheet | action | – | – |
| `image` | تصویر | Image | action | – | – |
| `share` | اشتراک‌گذاری | Share | action | **✓** | – |
| `send` | ارسال | Send | ai | – | – |
| `mic` | ورود صوتی | Microphone | ai | – | – |
| `stop` | توقف | Stop | ai | – | – |
| `thumb-up` | پاسخ مفید بود | Thumb up | ai | – | – |
| `thumb-down` | پاسخ مفید نبود | Thumb down | ai | – | – |
| `play` | پخش | Play | action | **✓** | – |
| `pause` | توقف نوار | Pause | action | – | – |
| `check-circle` | موفق | Success | status | – | – |
| `x-circle` | خطا | Error | status | – | – |
| `triangle-alert` | هشدار | Warning | status | – | – |
| `info-circle` | توضیح | Info | status | – | – |
| `clock` | ساعت | Clock | status | – | – |
| `clock-alert` | قیمت قدیمی | Stale price | status | – | – |
| `calendar` | تاریخ | Calendar | status | – | – |
| `offline` | قطع اتصال | Offline | status | – | – |
| `sun` | حالت روشن | Light mode | status | – | – |
| `moon` | حالت تاریک | Dark mode | status | – | – |
| `phone` | تماس | Phone | channel | – | – |
| `location` | نشانی | Location | channel | – | – |
| `sms` | پیامک | SMS | channel | – | – |
| `telegram` | تلگرام | Telegram | channel | – | – |
| `whatsapp` | واتساپ | WhatsApp | channel | – | – |
| `eitaa` | ایتا | Eitaa | channel | – | – |
| `instagram` | اینستاگرام | Instagram | channel | – | – |
| `dashboard` | داشبورد | Dashboard | admin | – | – |
| `catalog-box` | کاتالوگ | Catalog | admin | – | – |
| `pricing-grid` | جدول قیمت | Pricing grid | admin | – | – |
| `audit-history` | تاریخچه | Audit history | admin | – | – |
| `layers` | لایه‌ها | Layers | admin | – | – |
| `toggle` | کلید | Toggle | admin | **✓** | – |
| `kanban` | کانبان | Kanban | admin | – | – |

## Documented exceptions to "outline only"

| icon | why |
|---|---|
| `ai-mark` | brand mark; an outlined composite closes up below 18 px (kept verbatim) |
| `play` / `pause` | media controls at 16 px inside the 36 px ticker strip |
| `heart` / `bell` / `star` | `filled` prop for the selected state — same path, `fill: currentColor` |

## Files

| file | what |
|---|---|
| `ahantime-icons.svg` | sprite, one `<symbol>` per icon + micro masters |
| `svg/<id>.svg` | standalone per icon (`<id>-micro.svg` for the small master) |
| `handoff/icons.tsx` | drop-in for `web/src/components/primitives/icons.tsx` |
| `handoff/CategoryArt.tsx` | drop-in for `web/src/components/catalog/CategoryArt.tsx` |
| `handoff/SubCategoryArt.tsx` | drop-in for `web/src/components/catalog/SubCategoryArt.tsx` |
