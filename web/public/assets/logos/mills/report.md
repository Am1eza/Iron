# Mill logos — collection report

## Summary

All 8 factories from the `FACTORIES` list (now `millLogos` in `index.ts`) have a
real logo in place. 5 came from the mills' own official sites, 3 from Wikipedia/
Wikimedia (which mirrors the same official corporate mark).

| Mill (as shown on site) | Slug | File | Source |
|---|---|---|---|
| فولاد مبارکه | `mobarakeh-steel` | `mobarakeh-steel.webp` | Official site header logo — msc.ir |
| ذوب‌آهن اصفهان | `esfahan-steel` | `esfahan-steel.webp` | fa.wikipedia.org infobox logo (`Zob_Ahan_logo.png`) — matches the corporate mark used on esfahansteel.ir |
| فولاد خوزستان | `khuzestan-steel` | `khuzestan-steel.webp` | fa.wikipedia.org infobox logo (`KSCLOGO.png`) |
| فولاد کاوه | `kaveh-steel` | `kaveh-steel.svg` | Official site — sksco.ir (Kaveh South Kish Steel Co.), clean vector wordmark |
| فولاد نیشابور | `neyshabur-steel` | `khorasan-steel.webp` | fa.wikipedia.org infobox logo (`Logo-kscco.png`) — the company is «شرکت مجتمع فولاد خراسان» (Khorasan Steel Complex, ticker فخاس); fa.wikipedia redirects «فولاد نیشابور» to this article, and its products are marketed as «میلگرد نیشابور» |
| فولاد ارفع | `arfa-steel` | `arfa-steel.webp` | Official site header logo — arfasteel.ir (شرکت آهن و فولاد ارفع) |
| نورد یزد | `yazd-rolling` | `yazd-rolling.webp` | Official site header logo — yazdfoulad.com (هلدینگ فولاد یزد / احرامیان), alt text «نماد فولاد یزد» |
| فولاد کویر | `kavir-steel` | `kavir-steel.webp` | Official site header logo — kavirsteel.ir |

## Method

1. Identified the full company name behind each short factory name already in
   `FACTORIES` (Wikipedia + web search for the official domain).
2. Where fa.wikipedia's infobox carried a `logo` image distinct from a plant
   photo, downloaded it via `Special:FilePath` (works for both Commons-hosted
   and locally-hosted fa.wikipedia files).
3. Where no usable Wikipedia logo existed, fetched the company's own homepage
   HTML and located the header `<img>` actually used as the site logo/brand
   mark (not a news-article photo or generic favicon).
4. Converted everything to `.webp` (quality ~85–90, longest edge capped
   around 420–480px) except the Kaveh wordmark, kept as the original clean
   SVG. All files preserve transparency where the source had it.

## Notes

- **فولاد مبارکه (Mobarakeh Steel, MSC)** — Wikipedia's infobox image for this
  company (`Foolad_Mobarakeh7.jpg`) is a site photograph, not a logo, so it
  was rejected. The logo actually used is a small (176×37) transparent
  wordmark from msc.ir's own header (`logo-1404-04.png` — the year in the
  filename is msc.ir's own cache-busting convention, not a seasonal graphic;
  it is the live header logo at the time of collection).
- **فولاد نیشابور** is not an independent company; the fa.wikipedia article
  under that exact title redirects to «شرکت مجتمع فولاد خراسان» (Khorasan
  Steel Complex), which is Neyshabur's actual steel producer — confirmed by
  its Neyshabur head office and «میلگرد نیشابور» branded product.
- **فولاد کاوه** was resolved to «فولاد کاوه جنوب کیش» (Kaveh South Kish
  Steel Co., sksco.ir) — the best-known steel producer carrying the «کاوه»
  name (a large direct-reduced-iron/sponge-iron producer). If a different
  «کاوه» mill was intended, swap the `website`/`file` for `kaveh-steel` in
  `index.ts`; the slug and `nameFa` (used for the `/search` link) do not need
  to change.
- **نورد یزد** was resolved to «فولاد یزد» / Ahramian Group (yazdfoulad.com,
  formerly «شرکت نورد فولاد صنعتی و ساختمانی یزد») — the long-running Yazd
  rolling-mill operator. Its site logo is an abstract orange droplet/flame
  mark rather than a wordmark; this was double-checked against the page's own
  `alt="نماد فولاد یزد"` (Yazd Steel emblem) to confirm it is really the
  brand mark and not an unrelated icon.
- All logo source domains are `.ir` company sites; a couple (notably
  `esfahansteel.ir`) can time out depending on network routing at the moment
  of a build/deploy — this only affects the `website` link value in
  `index.ts`, not the logo file itself, which is already downloaded and
  committed.

## To update one

Replace `<slug>.webp` (or `.svg`) in this folder and, if the file extension
changes, update `file` for that entry in `index.ts`. `hasLogo` should stay
`true` as long as a real file is present.
