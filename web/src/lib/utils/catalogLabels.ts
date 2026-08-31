/**
 * Per-category display labels for the shared SKU attribute columns.
 *
 * `skus.size` is one column for the whole catalog, but it does not mean the
 * same thing in every category. For میلگرد/تیرآهن/لوله/… it really is a
 * «سایز» (the market size number). For ورق it is a **thickness in
 * millimetres** — the trade calls it «ضخامت», never «سایز», and the owner
 * asked for the public and admin UI to say so. Nothing about the stored data
 * changes: this is a label, resolved from the CATEGORY the row is being shown
 * under, so the rename can never leak into a category that legitimately says
 * «سایز».
 *
 * Keyed on the category SLUG (`categories.slug`, e.g. `sheet`) — the same
 * identifier `PriceRow.categoryId` carries (catalogRepo's `toPriceRow` maps
 * the FK to the slug) and the same one the admin form's `parentCategory.slug`
 * has, so every caller can answer the question without a lookup.
 *
 * The same idea, one level deeper, drives the grade/standard column: تیرآهن
 * resolves it from the SUB-category slug too, because «گرید» is meaningless
 * there except on هاش سبک/هاش سنگین, where the meaningful value lives in a
 * different stored column (`skus.standard`) entirely.
 */

import type { PriceBasis, PriceUnit } from '@/lib/types/domain';
import { toPersianDigits } from '@/lib/utils/format';
import { CITIES } from '@/lib/data/logistics';

/** Categories whose `size` column holds a thickness. Only ورق today. */
const THICKNESS_CATEGORIES = new Set(['sheet']);

/** Categories that additionally carry a width×length. Only ورق — a plate has
 *  three dimensions and `size` only holds the thickness. */
const DIMENSIONS_CATEGORIES = new Set(['sheet']);

/** The exact نبشی sub-categories whose wall thickness the owner asked to
 *  record alongside the existing «سایز» (1405/06). Deliberately an allow-list:
 *  `angle-channel` also contains وال‌پست and تی‌بار, and the request was for
 *  نبشی only — widening this to the whole parent category would give those
 *  unrelated product lines a meaningless extra field. */
const NABSHI_THICKNESS_SUBS = new Set(['nabshi', 'angle-unequal', 'spot']);

/** Stainless sections whose stored secondary dimension is wall thickness.
 *  `profile` (پروفیل استیل) joined 1405/06/08 to match ahanonline.com, which
 *  publishes «ضخامت» as its own column beside «ابعاد» for this sub — unlike
 *  `pipe`, which ahanonline shows with no alloy/thickness column at all. */
const STEEL_THICKNESS_SUBS = new Set(['angle', 'channel', 'profile']);

/** Profile sections whose secondary dimension is wall thickness.
 *
 * ahanonline publishes thickness as its own column on the three live profile
 * lines this catalog can currently price (industrial, furniture/light and
 * galvanized), just as it does beside Z's height. Their square/rectangular
 * `size` remains the outside section; `dimensions` carries the independent
 * wall gauge. This is deliberately a per-sub allow-list: the remaining
 * profile families have no active priced row from which we can verify and
 * backfill that fact without guessing. */
const PROFILE_THICKNESS_SUBS = new Set([
  'prvfyl-snaty',
  'profil-mobli',
  'profil-galvanizeh',
  'profil-z',
]);

/** Coloured-metal sheet lines whose `dimensions` is width×length. */
const COLOURED_SHEET_DIMENSION_SUBS = new Set(['aluminum-sheet', 'copper-sheet']);

/**
 * Coloured-metal SECTION lines (نبشی/ناودانی/لوله/پروفیل آلومینیوم) whose
 * `dimensions` is wall thickness — the same STEEL_THICKNESS_SUBS/
 * PROFILE_THICKNESS_SUBS concept, applied here 1405/06/08 after checking
 * these exact four subs against a live third-party reference (ahanonline.com
 * has no page for any of them): ahanyekta.com's نبشی/لوله/پروفیل آلومینیوم
 * pages each publish «ابعاد» (cross-section, already our `size`) AND its own
 * «ضخامت» (wall thickness) AND «طول شاخه» as three separate facts — see
 * `COLOURED_METAL_ATTRS`' `branchLength` entries for these same four subs.
 * ناودانی is included by the same physical-product reasoning as its سیبلینگ
 * نبشی (no direct reference page found for it specifically, but it is the
 * same section-profile family with the same three facts).
 */
const COLOURED_SECTION_THICKNESS_SUBS = new Set([
  'aluminum-angle',
  'aluminum-channel',
  'aluminum-pipe',
  'aluminum-profile',
]);

/**
 * نبشی و ناودانی sub-categories that publish the branch length, «۶ متری» /
 * «۱۲ متری», under the label «حالت» — INSTEAD of «گرید».
 *
 * Originally an owner request (1405/06) to swap the always-empty «گرید»
 * column for the length, labelled «شاخه». Relabelled to «حالت» 1405/06/08
 * after the owner confirmed matching ahanonline.com's exact columns: its
 * نبشی and ناودانی pages publish this exact same fact (verified live —
 * ahanonline's «حالت» cells read «۶ متری» / «۱۲ متری», i.e. the same branch
 * length) under that word, not «شاخه». No data changes, only the label; the
 * admin edit form (`SkuDrawer`) still says «شاخه» — an internal admin term,
 * out of scope for matching a public competitor site.
 *
 * `separi` moved OUT of this set 1405/06/08: ahanonline's سپری page uses its
 * own third label, «طول شاخه» — already the `branchLength` AttrKey's label,
 * shared with لوله/پروفیل — so سپری now reads that key instead of this one.
 *
 * `val-post` is deliberately EXCLUDED, and it is the whole reason this is an
 * allow-list rather than the category. It is the one sub whose `grade` holds
 * real published data — «ضخامت ۲», on all 8 of its live rows — so swapping
 * the column there would delete a value from the price table that an admin
 * deliberately entered. ahanonline's وال‌پست page confirms this is genuinely
 * a «ضخامت» column (numeric, e.g. «۲») rather than a گرید — val-post now
 * reads that same `grade` value under the `gradeAsThickness` key instead.
 *
 * Slugs verified against the live catalog, not `data/nav.ts` — which its own
 * header labels a mock fixture.
 */
const ANGLE_CHANNEL_BRANCH_SUBS = new Set([
  'nabshi',
  'angle-unequal',
  'channel-light',
  'channel-heavy',
]);

/** سپری's own «طول شاخه» AttrKey mapping — see `ANGLE_CHANNEL_BRANCH_SUBS`. */
const ANGLE_CHANNEL_BRANCH_LENGTH_SUBS = new Set(['separi']);

/**
 * نبشی لقمه's own «طول» mapping — cut to order, so an EMPTY length is the
 * answer rather than a gap.
 *
 * `spot` moved out of `ANGLE_CHANNEL_BRANCH_SUBS` 1405/06/09. ahanonline has
 * no لقمه page of its own, so this was decided against markazeahan.com's
 * dedicated one (`/product-category/قیمت-نبشی-لقمه/`, fetched 1405/06/09):
 * its table publishes «نام محصول | ضخامت | طول | محل بارگیری», and BOTH
 * «ضخامت» and «طول» read «دلخواه» on every row — a لقمه is a cut piece made
 * to the buyer's order, not a mill-standard ۶/۱۲-metre شاخه. Under the
 * `branch` key inherited from its نبشی siblings the column was «حالت» and
 * read «نامشخص» on all 5 live rows, claiming we merely failed to record a
 * length that does not exist. `customLength` says «بر اساس سفارش» instead,
 * which is the same answer markazeahan's «دلخواه» gives — the identical
 * reasoning پروفیل Z already uses for the same key.
 *
 * Single-source: no table-bearing لقمه page was found on ahanonline,
 * teleahan, fooladiranian, mashhadfoolad or neginfoolad (checked 1405/06/09
 * — the first four have نبشی tables but no لقمه line; the last has no table
 * at all). The «ضخامت» half is unaffected: `spot` stays in
 * `NABSHI_THICKNESS_SUBS`, which markazeahan's column set confirms.
 */
const ANGLE_CHANNEL_ORDER_LENGTH_SUBS = new Set(['spot']);

/** وال‌پست's own «ضخامت» AttrKey mapping — see `ANGLE_CHANNEL_BRANCH_SUBS`. */
const ANGLE_CHANNEL_THICKNESS_GRADE_SUBS = new Set(['val-post']);

/** تیرآهن sub-category slugs where «استاندارد» (`skus.standard`, e.g. HEA/HEB
 *  per DIN 1025) is the meaningful column. Everywhere else in تیرآهن the
 *  «گرید» column is unfilled noise the owner asked removed. */
const IBEAM_STANDARD_SUBS = new Set(['hash-sabok', 'hash-sangin']);

/**
 * تیرآهن لانه‌زنبوری's own «استاندارد» mapping — added 1405/06/09.
 *
 * It had been falling through to the category's bare `[]`, publishing no
 * attribute column at all. ahanonline's dedicated
 * `/تیرآهن-و-هاش/تیرآهن/تیرآهن-لانه-زنبوری/` page (fetched 1405/06/09) does
 * publish one: its price table's own `<th>`s read «نام کالا | سایز |
 * استاندارد | واحد | برند | محل تحویل | …», and the استاندارد cell carries a
 * real castellated-beam designation («CPE»). That is the SAME `skus.standard`
 * column هاش already uses for HEA/HEB, so this is a wiring gap, not a new
 * fact: the field exists, is editable, and was simply never offered here.
 *
 * All 4 live لانه‌زنبوری rows store `standard = NULL` today, so every cell
 * reads «نامشخص» until an admin fills it. That is the established convention
 * in this file (see `COLOURED_METAL_ATTRS`' aluminium section entries):
 * wiring the column the source actually publishes, honestly empty, is how
 * the catalog collects exactly what the market publishes — the alternative
 * is a page that structurally cannot ever show a fact its competitors do.
 *
 * Deliberately SEPARATE from `IBEAM_STANDARD_SUBS` rather than merged into
 * it: هاش additionally publishes a «حالت» (branch length) that لانه‌زنبوری's
 * page does not, so the two sets resolve to different column LISTS even
 * though they share this one column.
 *
 * `tirahan` and `light` stay on the bare `[]` — see `attrKeysFor`.
 */
const IBEAM_CASTELLATED_SUBS = new Set(['lane-zanburi']);

/**
 * تیرآهن sub-categories whose factory-section headings must name the
 * SUB-TYPE, not just the category (owner report, 1405/06).
 *
 * The price page groups its rows into one «قیمت {موضوع} {کارخانه}» section
 * per mill, and that subject had always been the category name alone. Under
 * هاش or لانه‌زنبوری that reads as a lie: the section «قیمت تیرآهن ذوب‌آهن
 * اصفهان» sits directly above rows whose own auto-composed names say «هاش
 * سبک ۱۴ ذوب‌آهن اصفهان». A visitor scanning headings sees plain تیرآهن
 * pricing where there is none — and these are genuinely different products at
 * genuinely different prices, not a naming nicety.
 *
 * Deliberately an allow-list, exactly like NABSHI_THICKNESS_SUBS and
 * PIPE_SCHEDULE_SUBS. `tirahan` — the plain-تیرآهن sub — must NOT be in it:
 * its own name IS the category word, so naming the sub there would produce
 * «قیمت تیرآهن تیرآهن ذوب‌آهن اصفهان», the exact stutter
 * `subCategorySubject` was written to prevent. Every other category is
 * untouched: «قیمت میلگرد کویر کاشان» stays as it is, because nobody reported
 * it reading wrong and «میلگرد» is not a claim about the wrong product the
 * way «تیرآهن» is on a هاش page.
 *
 * Slugs verified against the live catalog (1405/06), NOT `data/nav.ts` —
 * which is labelled a mock fixture in its own header and still lists `hea`,
 * `heb` and `castellated`, none of which exist in the database. Gating on
 * those would have matched no rows and shipped a silent no-op.
 */
const IBEAM_SUBTYPE_HEADING_SUBS = new Set(['hash-sabok', 'hash-sangin', 'lane-zanburi']);

/**
 * لوله sub-categories that carry a «رده» (`skus.schedule`) — the pipe
 * schedule, the trade's own name for a wall-thickness/pressure class
 * («رده ۴۰», «رده ۸۰», per ASME B36.10).
 *
 * Deliberately an allow-list rather than the whole category, for the same
 * reason the نبشی thickness one is: «رده» is a real property of pipe sold by
 * pressure/schedule class, and of nothing else under لوله. لولهٔ مبلی is
 * furniture tube sold on outside diameter and wall gauge, and لولهٔ داربستی
 * is scaffold tube sold to a scaffolding spec; neither carries a schedule
 * rating at all, so offering the field there would ask an admin to invent a
 * value for a property the product does not have — these two stay excluded.
 *
 * BOTH مانیسمان subs are listed because that sub-category really is split in
 * production — «مانیسمان داخلی» and «مانیسمان خارجی» — and a schedule is the
 * same fact on either side of the split. The slugs are the live ones, read
 * from the production catalog rather than from `data/nav.ts`, which still
 * lists a single `seamless` sub that no longer exists and would therefore
 * have matched no rows at all.
 *
 * اسپیرال, جدار چاه, گازی, صنعتی and گوشت‌دار were added on top of مانیسمان
 * for one stretch (1405/06) on the theory that each is arguably pressure-
 * rated too. Reverted the same day after checking ahanonline.com's own live
 * pages for all five: none of them publish a «رده» column at all — they sell
 * on «ضخامت» (a millimetre wall thickness) instead, which every one of these
 * subs already has in `skus.size`/`skus.standard`. ASME B36.10 schedule
 * numbers are not how the Iranian market actually classifies گازی, جدار چاه
 * or اسپیرال pipe, so populating one here would not mirror a real published
 * fact — it would manufacture a classification nobody in this trade uses for
 * these products. مانیسمان is the one pipe family actually sold and quoted
 * by «رده ۴۰» / «رده ۸۰» — on ahanonline and everywhere else — which is why
 * it alone stays in this set.
 */
const PIPE_SCHEDULE_SUBS = new Set(['seamless-internal', 'seamless-external']);

/**
 * لوله sub-categories whose «کارخانه» column is really a «برند».
 *
 * مانیسمان sold here is IMPORTED, not rolled by a named Iranian mill, so the
 * only value an admin can honestly put in that box is an origin — «چینی»,
 * «اروپایی» — and not a factory at all. That is the same real-world situation
 * `factoryIsMeaningful` documents for استیل, and the owner's reasoning is the
 * one quoted there.
 *
 * The RESOLUTION is deliberately different. استیل drops the column outright,
 * because nothing in it was worth publishing. مانیسمان keeps it, because an
 * origin genuinely IS what a مانیسمان buyer compares on — what is wrong is
 * the column's name and its expected contents, not its existence. So this
 * belongs with `sizeLabel`/`dimensionsLabel` — one stored column, relabelled
 * per context — and not with the factory removal.
 *
 * Go-forward only, and nothing is backfilled: the live مانیسمان rows still
 * hold mill-shaped values and keep them until an admin edits each one, the
 * same way the نبشی thickness column was left null rather than guessed at.
 */
const SEAMLESS_BRAND_SUBS = new Set(['seamless-internal', 'seamless-external']);

export const SIZE_LABEL = 'سایز';
export const HEIGHT_LABEL = 'ارتفاع';
export const THICKNESS_LABEL = 'ضخامت';
export const DIMENSIONS_LABEL = 'ابعاد';
export const GRADE_LABEL = 'گرید';
export const STANDARD_LABEL = 'استاندارد';
export const SCHEDULE_LABEL = 'رده';
/** The default name of the `skus.factory` column — see `factoryLabel`. */
export const FACTORY_LABEL = 'کارخانه';
/** …and what مانیسمان calls it instead, where the value is an origin. */
export const BRAND_LABEL = 'برند';
export const WEIGHT_LABEL = 'وزن';
export const BRANCH_WEIGHT_LABEL = 'وزن شاخه';

/** True when this category measures its products by thickness. */
export function usesThickness(categorySlug: string | null | undefined): boolean {
  return Boolean(categorySlug && THICKNESS_CATEGORIES.has(categorySlug));
}

/**
 * True when the shared `skus.dimensions` column is meaningful in this exact
 * catalog context. For ورق it remains category-wide width×length. For the
 * approved section subs it is wall thickness; every unlisted sibling stays
 * untouched.
 *
 * Drives whether the column/field is OFFERED at all — callers must pass the
 * active/product sub-category so a mixed «همه» view does not grow a column
 * that is meaningless for some of its rows.
 */
export function usesDimensions(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null = null,
): boolean {
  if (categorySlug && DIMENSIONS_CATEGORIES.has(categorySlug)) return true;
  if (
    categorySlug === 'felezat-rangi' &&
    Boolean(
      subCategorySlug &&
      (COLOURED_SHEET_DIMENSION_SUBS.has(subCategorySlug) ||
        COLOURED_SECTION_THICKNESS_SUBS.has(subCategorySlug)),
    )
  ) {
    return true;
  }
  if (
    categorySlug === 'steel' &&
    Boolean(subCategorySlug && STEEL_THICKNESS_SUBS.has(subCategorySlug))
  ) {
    return true;
  }
  if (
    categorySlug === 'profile' &&
    Boolean(subCategorySlug && PROFILE_THICKNESS_SUBS.has(subCategorySlug))
  ) {
    return true;
  }
  return (
    categorySlug === 'angle-channel' &&
    Boolean(subCategorySlug && NABSHI_THICKNESS_SUBS.has(subCategorySlug))
  );
}

/** «ابعاد» for sheet width×length (فلزات‌رنگی's ورق subs included — that
 *  meaning stays width×length there, unlike its SECTION subs below), «ضخامت»
 *  for the verified section subs. The generic fallback stays «ابعاد» so an
 *  unknown or mixed context can never silently misdescribe the shared column
 *  as thickness; those contexts do not render it in the first place. */
export function dimensionsLabel(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null = null,
): string {
  return (categorySlug === 'angle-channel' &&
    subCategorySlug &&
    NABSHI_THICKNESS_SUBS.has(subCategorySlug)) ||
    (categorySlug === 'steel' && subCategorySlug && STEEL_THICKNESS_SUBS.has(subCategorySlug)) ||
    (categorySlug === 'profile' &&
      subCategorySlug &&
      PROFILE_THICKNESS_SUBS.has(subCategorySlug)) ||
    (categorySlug === 'felezat-rangi' &&
      subCategorySlug &&
      COLOURED_SECTION_THICKNESS_SUBS.has(subCategorySlug))
    ? THICKNESS_LABEL
    : DIMENSIONS_LABEL;
}

/** «ضخامت» for ورق, «ارتفاع» on پروفیل Z, «سایز» everywhere else. The Z
 *  spelling is sub-scoped because every sibling profile is still bought by
 *  its section size; mixed/category lists therefore keep the safe generic.
 *
 *  فلزات‌رنگی's ورق subs (`aluminum-sheet`/`copper-sheet`) are «ضخامت» too —
 *  verified against ahanonline.com's own ورق آلومینیوم/ورق مسی pages
 *  1405/06/08, same THICKNESS_CATEGORIES concept as the main ورق category
 *  but sub-scoped rather than category-wide, since سایز genuinely means size
 *  (not thickness) on every OTHER فلزات‌رنگی sub (میلگرد/نبشی/لوله/…). */
export function sizeLabel(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null = null,
): string {
  if (categorySlug === 'profile' && subCategorySlug === 'profil-z') return HEIGHT_LABEL;
  if (
    categorySlug === 'felezat-rangi' &&
    Boolean(subCategorySlug && COLOURED_SHEET_DIMENSION_SUBS.has(subCategorySlug))
  ) {
    return THICKNESS_LABEL;
  }
  return usesThickness(categorySlug) ? THICKNESS_LABEL : SIZE_LABEL;
}

/**
 * «وزن» for ورق, «وزن شاخه» everywhere else.
 *
 * ورق is sold per برگ (sheet/leaf), never in a «شاخه» (mill bar/rod) — the
 * word does not describe the product at all there, unlike میلگرد/تیرآهن/نبشی
 * where the stored theoretical weight genuinely is one branch's weight. Keyed
 * on the same THICKNESS_CATEGORIES set sizeLabel already uses: it is exactly
 * the categories where «شاخه» stops applying.
 */
export function weightLabel(categorySlug: string | null | undefined): string {
  return usesThickness(categorySlug) ? WEIGHT_LABEL : BRANCH_WEIGHT_LABEL;
}

/* ---------------------- per-sub attribute columns ---------------------- */

/**
 * پروفیل sub-category slugs where the fabricated «کارخانه» value is not shown.
 *
 * ahanonline — the reference the owner benchmarks these pages against — has no
 * per-brand factory column on پروفیل at all: it groups by CITY («پروفیل
 * اصفهان», «پروفیل تهران») and uses «محل تحویل: کارخانه» as a delivery TERM
 * (ex-works pickup vs warehouse delivery), never as a company name. The
 * `skus.factory` values this catalog carried for these sub-categories («نیکان
 * پروفیل», «کیان پرشیا», …) correspond to nothing in that data and were never
 * real brand identities the way «فولاد مبارکه» genuinely is for ورق — so the
 * owner asked for the distinction removed rather than corrected.
 *
 * «پروفیل ساختمانی» is deliberately NOT in this set: it keeps its factory
 * column exactly as before.
 *
 * The stored column is untouched — this suppresses the value at the DTO
 * boundary (`catalogRepo.toPriceRow`), so every surface fed by a `PriceRow`
 * (table, cards, spec sheet, facet rail, sitemap, export, the AI's grounding)
 * agrees, and the raw rows stay queryable for audit.
 */
const PROFILE_NO_FACTORY_SUBS = new Set([
  'prvfyl-snaty',
  'profil-mobli',
  'profil-sotuni',
  'profil-galvanizeh',
  'profil-z',
  'prvfyl-astyl',
]);

/**
 * Whether a mill name means anything for products in this category/sub-category
 * — i.e. whether `skus.factory` should be published at all. True everywhere
 * except the پروفیل sub-categories listed above and the whole استیل category.
 *
 * **استیل is category-wide and has no exceptions.** Every product in it is
 * IMPORTED stainless, so there is no Iranian mill to name, and the owner's
 * employer asked for the column removed outright: «برای استیل‌ها چون که
 * وارداتی هست باید کلاک کارخانه رو حذف بکنیم، فقط محصول رو می‌ذاریم، آلیاژش
 * رو می‌نویسیم و طولش رو» (1405/06). The stored `skus.factory` values agree
 * that it was never a mill: they are «چین» on every نبشی row and «تایوان» on
 * every ناودانی row — a country of ORIGIN, empty for لوله and پروفیل — so the
 * page was publishing a «کارخانه» column, a «مرتب‌سازی بخش‌های کارخانه» sort
 * control and a «۱ کارخانه» stat on top of a field that holds no factory at
 * all. Unlike پروفیل this needs no per-sub allow-list: the reason applies to
 * every sub under استیل, including the empty ones (فلنج، مش، رینگ، فنر، تسمه،
 * تیوب، توری), which are imported stainless too.
 */
export function factoryIsMeaningful(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null | undefined,
): boolean {
  if (categorySlug === 'steel') return false;
  if (categorySlug !== 'profile') return true;
  return !(subCategorySlug && PROFILE_NO_FACTORY_SUBS.has(subCategorySlug));
}

/**
 * What the `skus.factory` column is CALLED in this exact catalog context —
 * «برند» on مانیسمان, «کارخانه» everywhere else.
 *
 * The companion to `factoryIsMeaningful`, and deliberately a SEPARATE
 * question from it: that one decides whether the column is published at all,
 * this one decides what to call it where it is published. A sub can perfectly
 * well have a meaningful factory column under a name other than «کارخانه»,
 * which is exactly مانیسمان's case, so a caller that needs both answers asks
 * both.
 *
 * Keyed on category AND sub like `dimensionsLabel`, and with the same
 * fallback rule: anything unknown, and any mixed «همه» view whose rows do not
 * agree on one sub, resolves to the generic «کارخانه». That is the safe
 * direction — a مانیسمان row sitting under a «کارخانه» header is merely
 * generic, whereas a گازی row under a «برند» header would be a false claim
 * about what its mill name is.
 *
 * Before this existed «کارخانه» was a bare string literal repeated across the
 * table header, the row cell's `data-label`, the compare sheet, the section
 * noun, the spec sheet and the admin form. Six hand-copied copies is how a
 * relabel like this one silently half-lands.
 */
export function factoryLabel(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null | undefined = null,
): string {
  return categorySlug === 'pipe' && subCategorySlug && SEAMLESS_BRAND_SUBS.has(subCategorySlug)
    ? BRAND_LABEL
    : FACTORY_LABEL;
}

export const BRANCH_LENGTH_LABEL = 'طول شاخه';
export const CUSTOM_LENGTH_LABEL = 'طول سفارشی';
export const LENGTH_LABEL = 'طول';
export const ALLOY_LABEL = 'آلیاژ';
/**
 * «شاخه» — deliberately NOT «طول شاخه» (`BRANCH_LENGTH_LABEL`) even though
 * both read the same column. That one answers "how long is one شاخه" beside a
 * پروفیل's other specs; this one IS the product distinction a نبشی buyer
 * chooses on, and the owner asked for the short word. They also print
 * differently — «۶ متر» there, «۶ متری» here — because «۶ متری» is an
 * adjective describing the شاخه, which is how the trade says it.
 */
export const BRANCH_LABEL = 'شاخه';
export const CONDITION_LABEL = 'حالت';

/** Printed where the column is not a property of THAT row's product at all —
 *  «نامشخص» would claim the value is merely unknown. */
export const NOT_APPLICABLE = '—';
/** Printed where it IS a property of the product but nobody has entered it. */
export const UNKNOWN_VALUE = 'نامشخص';
/** «طول سفارشی» for a product with no standard branch length: پروفیل Z is cut
 *  to order, so an empty length is an answer, not a gap. */
const CUT_TO_ORDER = 'بر اساس سفارش';

/** The identity of one attribute column. Not a free label: the same key drives
 *  the header, the desktop cell, the mobile card line and the spec sheet, so
 *  they cannot drift into three different words for one fact. */
export type AttrKey =
  | 'grade'
  | 'standard'
  | 'alloy'
  | 'condition'
  | 'legacyCondition'
  | 'branchLength'
  | 'profileCondition'
  | 'length'
  | 'customLength'
  | 'schedule'
  | 'branch'
  | 'gradeAsThickness';

/** The subset of a price row the attribute columns read. Deliberately
 *  structural rather than `PriceRow` so the admin tables and the spec sheet can
 *  reuse it without carrying the public DTO. */
export type AttrRow = {
  subCategoryId: string;
  grade?: string;
  condition?: string;
  standard?: string;
  schedule?: string;
  branchLengthM?: number;
};

function metres(m: number | null | undefined): string | undefined {
  return m ? `${toPersianDigits(m)} متر` : undefined;
}

/** «۶ متری» — the same stored number as `metres`, said the way a نبشی buyer
 *  says it: an adjective for the شاخه, not a bare measurement. */
function metresAdjective(m: number | null | undefined): string | undefined {
  return m ? `${toPersianDigits(m)} متری` : undefined;
}

const ATTR_DEFS: Record<AttrKey, { label: string; read: (r: AttrRow) => string | undefined }> = {
  grade: { label: GRADE_LABEL, read: (r) => r.grade },
  standard: { label: STANDARD_LABEL, read: (r) => r.standard },
  // «آلیاژ» is `skus.grade` re-labelled, not a new stored column: on a
  // stainless product the stored grade genuinely IS the alloy
  // (۲۰۱/۳۰۴/۳۰۴L/۳۱۶L), which is the one spec a stainless buyer actually asks
  // for. Used by the whole استیل category and by پروفیل استیل.
  alloy: { label: ALLOY_LABEL, read: (r) => r.grade },
  // «حالت» is now its own stored fact because alloy and supplied form can
  // coexist on one product (an aluminium sheet may be 1050 AND «شیت»).
  condition: { label: CONDITION_LABEL, read: (r) => r.condition },
  // Main ورق and چهارپهلو are the two verified legacy families whose owner-
  // entered `grade` values are actually conditions («رول»/«برش خورده» and
  // «نرمال»/«ترانس»). They alone retain a read fallback during rollout so
  // deploying the nullable column before running the guarded data script
  // cannot temporarily render «نامشخص». This MUST stay a separate key from
  // `condition`: falling grade back globally would show aluminium alloy 1050
  // a second time under «حالت», recreating the exact conflation the new
  // column fixes.
  legacyCondition: { label: CONDITION_LABEL, read: (r) => r.condition ?? r.grade },
  branchLength: { label: BRANCH_LENGTH_LABEL, read: (r) => metres(r.branchLengthM) },
  // On ahanonline's industrial and furniture/light profile tables, «حالت» is
  // not a material condition like sheet's رول/برش‌خورده. Its values are
  // «۶ متری»/«۱۲ متری»: the supplied branch length this catalog already
  // stores structurally in `branch_length_m`. Reusing that fact mirrors the
  // source without overloading the independent `condition` column or copying
  // a formatted phrase into a second field.
  profileCondition: { label: CONDITION_LABEL, read: (r) => metresAdjective(r.branchLengthM) },
  // Galvanized profile calls the same physical fact «طول», not «حالت» and not
  // the catalog's generic «طول شاخه». A separate display key keeps the source
  // vocabulary sub-specific while all three surfaces still read the one
  // `branch_length_m` value.
  length: { label: LENGTH_LABEL, read: (r) => metresAdjective(r.branchLengthM) },
  // «رده» — the pipe schedule. Its own stored column (`skus.schedule`), and
  // deliberately NOT a re-label of `standard` the way `alloy` re-labels
  // `grade`: لولهٔ جدار چاه already stores a real «استاندارد» there (ST37, on
  // every live row of that sub), so borrowing the column would have made one
  // column mean two different things inside a single category — the exact
  // collision the ورق/نبشی reuse of `dimensions` avoids by never letting two
  // meanings meet under one parent.
  schedule: { label: SCHEDULE_LABEL, read: (r) => r.schedule },
  // `skus.branch_length_m` again, as نبشی و ناودانی's own product distinction
  // rather than as a پروفیل spec line. No new column: the length was already
  // stored and already editable, it simply had nowhere to show on these
  // pages. Labelled «حالت», not «شاخه» — see ANGLE_CHANNEL_BRANCH_SUBS — to
  // match ahanonline's exact wording for these subs. An unrecorded length
  // reads «نامشخص», never a dash — a نبشی IS sold in some شاخه, we just have
  // not recorded which.
  branch: { label: CONDITION_LABEL, read: (r) => metresAdjective(r.branchLengthM) },
  // وال‌پست's `skus.grade` genuinely holds a thickness value («۲»), not a
  // grade — see ANGLE_CHANNEL_BRANCH_SUBS. Same re-label move as `alloy`
  // above, just a different word for a different sub.
  gradeAsThickness: { label: THICKNESS_LABEL, read: (r) => r.grade },
  customLength: {
    label: CUSTOM_LENGTH_LABEL,
    read: (r) => metres(r.branchLengthM) ?? CUT_TO_ORDER,
  },
};

/**
 * پروفیل sub-categories whose «گرید» column is replaced.
 *
 * The 1405/06 ahanonline reconciliation established that grade is not a
 * published profile attribute on any of the three profile lines with active
 * prices here. صنعتی and مبلی call their stored branch length «حالت»;
 * گالوانیزه calls it «طول». All three also publish wall thickness separately
 * through `PROFILE_THICKNESS_SUBS`. This follows the source's meanings rather
 * than inventing a profile grade or putting «۶ متری» into `condition`.
 *
 * Z and stainless retain their earlier verified rules. Unlisted/empty profile
 * families deliberately keep their previous fallback until they have a real,
 * priced source row to reconcile — absence of stock is not evidence for a
 * migration.
 */
const PROFILE_ATTRS: Record<string, AttrKey[]> = {
  'prvfyl-snaty': ['profileCondition'],
  'profil-mobli': ['profileCondition'],
  'profil-galvanizeh': ['length'],
  'profil-z': ['customLength'],
  'prvfyl-astyl': ['alloy', 'branchLength'],
  chaharpahlu: ['legacyCondition'],
};

/** Metal sheets outside the main ورق category. Aluminium genuinely needs
 *  both axes; copper currently has a verified condition but no alloy value.
 *
 *  Two more entries added 1405/06/08 after checking real production data
 *  against ahanonline.com — not a relabel-for-consistency guess:
 *  - `aluminum-rebar`: every one of its 57 live rows stores a real alloy
 *    designation in `grade` («۷۰۰۰», confirmed from the product names
 *    themselves — «میلگرد آلومینیوم گرید ۷۰۰۰ …»), exactly the `alloy`
 *    re-label pattern استیل/aluminum-sheet already use.
 *  - `copper-pipe`: every one of its 45 live rows stores «ضخامت X.XX» —
 *    literally the word «ضخامت» — IN `grade`, the same mislabeled-not-empty
 *    pattern as نبشی's وال‌پست (see catalogLabels' ANGLE_CHANNEL_THICKNESS_GRADE_SUBS
 *    and its `gradeAsThickness` AttrKey, reused here rather than duplicated).
 *    ahanonline's own لوله مسی page confirms «ضخامت» is the real column.
 *
 *  Five more entries added 1405/06/08 — no ahanonline page exists for any of
 *  these, so verified against ahanyekta.com (نبشی/لوله/پروفیل آلومینیوم) and
 *  ahanonline.com's تسمه مسی page instead. None of these five currently has
 *  ANY stored grade/condition/dimensions data (checked live in prod), so
 *  every cell reads «نامشخص» today — wiring the correct column now, honestly
 *  empty, is the same "collect exactly what is published" convention as
 *  aluminum-sheet's 0%-populated «condition» above, not a fabrication:
 *  - `aluminum-angle`/`aluminum-channel`/`aluminum-pipe`/`aluminum-profile`:
 *    ahanyekta's نبشی/لوله/پروفیل آلومینیوم pages each publish سایز (cross-
 *    section, already our `size`) + its own «ضخامت» (wall thickness, wired
 *    via COLOURED_SECTION_THICKNESS_SUBS above) + «طول شاخه»/«شاخه» (branch
 *    length) as three separate facts. ناودانی has no page of its own found,
 *    included by the same reasoning as its سیبلینگ نبشی (identical section-
 *    profile product family).
 *  - `copper-strip`: ahanonline's تسمه مسی page publishes a «حالت» column
 *    whose value is a fixed supplied-form phrase («شاخه ۴ متری»), the same
 *    concept `condition` already models for aluminum-sheet.
 */
const COLOURED_METAL_ATTRS: Readonly<Record<string, AttrKey[]>> = {
  'aluminum-sheet': ['alloy', 'condition'],
  'copper-sheet': ['condition'],
  'aluminum-rebar': ['alloy'],
  'copper-pipe': ['gradeAsThickness'],
  'aluminum-angle': ['branchLength'],
  'aluminum-channel': ['branchLength'],
  'aluminum-pipe': ['branchLength'],
  'aluminum-profile': ['branchLength'],
  'copper-strip': ['condition'],
};

/**
 * استیل sub-categories that deviate from the category's own default
 * (`['alloy', 'branchLength']`, see the big comment on `attrKeysFor` below).
 * Added 1405/06/08 after the owner confirmed matching ahanonline.com's exact
 * columns overrides the prior 1405/06 "no factory, alloy+length everywhere"
 * instruction — verified per sub against the live ahanonline.com page:
 *
 * - `pipe` (لوله استیل): ahanonline shows «سایز»+«رده»+«آلیاژ»+«حالت» (re-verified
 *   live 1405/06/09 via the rendered table's own `<th>`s — a wholesale-market
 *   page changes without notice, and the earlier note here that it omitted
 *   «آلیاژ» no longer matches what the page actually renders). Alloy is not
 *   optional for این خانواده either way: 316L/304L/310S sit up to 2.3× apart
 *   in price on that very page, exactly the identity fact
 *   `priceSync.match.ts`'s `IDENTITY['steel/pipe']` already keys its matching
 *   on via `skus.grade` — the display column had fallen out of sync with the
 *   matcher's own assumption about what distinguishes these rows.
 * - `profile` (پروفیل استیل): ahanonline keeps «آلیاژ» but ALSO shows «حالت»
 *   and its own «ضخامت» (wired via `STEEL_THICKNESS_SUBS` above); drops the
 *   length ahanonline does not show.
 * - `angle`/`channel` (نبشی/ناودانی استیل): ahanonline shows «آلیاژ» beside
 *   the `STEEL_THICKNESS_SUBS` «ضخامت», with no length column.
 *
 * Every sub NOT listed here — the currently-empty فلنج/مش/رینگ/فنر/تسمه/
 * تیوب/توری — keeps the category default: they have no live ahanonline page
 * to verify against, and no live rows to break.
 */
const STEEL_ATTRS: Readonly<Record<string, AttrKey[]>> = {
  pipe: ['alloy', 'condition', 'schedule'],
  profile: ['alloy', 'condition'],
  angle: ['alloy'],
  channel: ['alloy'],
};

/**
 * لوله sub-categories and the attribute columns their own source pages
 * publish — reconciled per sub 1405/06/09 against the RENDERED price tables
 * (the `<thead>`'s own `<th>`s, not the article prose underneath them, which
 * discusses standards no table column carries).
 *
 * **«گرید» is not a لوله column anywhere.** Every page checked below prices
 * pipe on سایز + ضخامت + a supplied length, and none of the nine live subs
 * showed a «گرید» header on any source. Until now this category returned
 * `['grade']` for all of them, so eight of nine published an empty column
 * under a word the trade does not use here. That is the taxonomy half of the
 * bug the 1405/06 data pass could not see: it checked whether `grade` held a
 * value, never whether the column belonged on the page at all.
 *
 * Sources — each fetched 1405/06/09, both columns read off the rendered
 * table, and ahanonline (the owner's named reference) cross-checked against
 * teleahan.com for every sub that has a page on both:
 *
 * | sub | ahanonline page | its spec columns | teleahan agrees |
 * |---|---|---|---|
 * | `galvanized` | `/انواع-لوله/لوله-گالوانیزه/` | سایز، ضخامت، حالت («۶ متری»)، استاندارد («تست آب») | yes, identical four |
 * | `industrial` | `/انواع-لوله/لوله-درز-مستقیم/` | سایز، ضخامت، حالت، استاندارد («صنعتی») | `/لوله-صنعتی/`: سایز، ضخامت |
 * | `scaffold` | `/انواع-لوله/لوله-داربستی/` | سایز، ضخامت، حالت | yes, identical three |
 * | `spiral` | `/انواع-لوله/لوله-اسپیرال/` | سایز، ضخامت، حالت («۱۲ متری») | yes, identical three |
 * | `well-casing` | `/انواع-لوله/لوله-جدار-چاه/` | سایز، برند، ضخامت | yes (سایز، ضخامت) |
 * | `gas` | `/انواع-لوله/لوله-درز-مستقیم/لوله-گاز-خانگی/` | سایز، ضخامت، برند | no page |
 * | `thick-walled` | `/انواع-لوله/لوله-گوشتدار/` | سایز — and nothing else | no page |
 * | `seamless-*` | `/انواع-لوله/لوله-مانسمان/` | سایز، رده، برند | yes, identical three |
 * | `furniture` | none | — see below | no table |
 *
 * What each entry does with that:
 *
 * - **`branch`, not `branchLength`.** Five subs publish the supplied length,
 *   and all of them label it «حالت» with an ADJECTIVE value — ahanonline's
 *   cells read «۶ متری»/«۱۲ متری», never «۶ متر». That is exactly what the
 *   `branch` key already renders for نبشی و ناودانی, so it is reused rather
 *   than duplicated. `spiral` is the one with data behind it today: all 12
 *   live rows already store `branch_length_m` (۱۲, one at ۶), so this column
 *   ships populated. The other four store none yet and read «نامشخص» — a
 *   pipe IS sold in some شاخه, we have simply not recorded which, which is
 *   the distinction `UNKNOWN_VALUE` exists to draw.
 * - **`standard` on گالوانیزه and صنعتی only.** Their «استاندارد» cells hold
 *   a pipe TYPE («تست آب», «صنعتی»), which is what `skus.standard` already
 *   models. No other pipe page publishes the column.
 * - **`well-casing` keeps a column, relabelled.** Its stored ST37 sits in
 *   `skus.standard` on all 13 live rows while the page was rendering the
 *   EMPTY `grade` under «گرید» — the "column reading the wrong stored field"
 *   case exactly. Both sources' جدار چاه tables show برند + ضخامت and no
 *   standard column, so strictly mirroring them would drop a real
 *   owner-entered value off the page; the وال‌پست precedent (#343) is to keep
 *   such a value under its truthful label instead. Flagged for the owner: if
 *   matching the source column-for-column wins here too, this becomes `[]`.
 * - **`spiral` keeps `grade`.** Same reasoning: ST37 on all 12 rows, stored
 *   in `grade` there rather than in `standard`, so it is read from where it
 *   actually lives and keeps the label that matches that field.
 * - **`gas` and `thick-walled` publish nothing.** Their sources' whole spec
 *   column set is سایز (+ ضخامت + برند), all of which this catalog renders
 *   outside the attribute columns. An empty list is the honest answer.
 * - **`furniture` (مبلی) has no ahanonline page**, so it was decided on two
 *   others, both fetched 1405/06/09: ahan1.com's
 *   `/Category/pipe/steel-furniture-pipe/` publishes «نام کالا | حالت | واحد
 *   | قیمت», its حالت reading «شاخه ۶ متری»; sabaprofile.com's
 *   `/قیمت-لوله-مبلی/` publishes «ضخامت | طول | تحویل | واحد | قیمت» with
 *   طول «۶ متر». Two independent sources, one shared fact — the ۶-metre
 *   supplied length — and ahan1's label is the same «حالت» every other pipe
 *   family here uses, so `branch` it is.
 *
 * ضخامت is deliberately absent from every entry: it is not an attribute
 * column, it is `usesDimensions`/`dimensionsLabel` territory, and no لوله row
 * in this catalog stores it (`skus.dimensions` is null on all 84). See the
 * PR's "needs a new DB column" section.
 */
const PIPE_ATTRS: Readonly<Record<string, AttrKey[]>> = {
  // مانیسمان — «رده» was already right (ahanonline and teleahan both publish
  // سایز | رده | برند, and `factoryLabel` already renames its «کارخانه» to
  // «برند» for exactly these subs). Only the empty «گرید» beside it goes.
  ...(Object.fromEntries([...PIPE_SCHEDULE_SUBS].map((sub) => [sub, ['schedule']])) as Record<
    string,
    AttrKey[]
  >),
  galvanized: ['standard', 'branch'],
  industrial: ['standard', 'branch'],
  scaffold: ['branch'],
  spiral: ['grade', 'branch'],
  furniture: ['branch'],
  'well-casing': ['standard'],
  gas: [],
  'thick-walled': [],
};

/**
 * کلاف و مفتول sub-categories and the columns their sources publish —
 * reconciled per sub 1405/06/09, all nine URLs below fetched that day and
 * read off the rendered `<thead>`.
 *
 * This category had never been reconciled at all: it has no branch in
 * `attrKeysFor` and so fell through to the catalog-wide `['grade']` on all
 * eight live subs. Six of the eight publish no grade-shaped column on any
 * source; the two that do are stainless, where the market word is «آلیاژ».
 *
 * - **`welding-wire` / `wire-rod` → «آلیاژ».** ahanonline prices these on its
 *   میلگرد tree, not its مفتولی one: `/میلگرد/سیم-جوش-استیل/` publishes
 *   «سایز | آلیاژ | واحد | …» and `/میلگرد/سیم-مفتول-استیل/» publishes
 *   «سایز | آلیاژ | حالت | واحد | …», حالت reading «بسته». Both of this
 *   catalog's subs store a real stainless designation in `skus.grade` —
 *   `316L` on all 8 live rows — so this is the same display-only re-label
 *   استیل and پروفیل استیل already use, pointed at the same field. `wire-rod`
 *   additionally gains the source's «حالت» through the independent
 *   `condition` column (empty today, like aluminium's).
 * - **`coil` / `coil-ribbed` → «استاندارد».** The material analysis IS a
 *   published کلاف column on three independent sources — markazeahan.com
 *   `/product-category/کلاف/` («آنالیز», e.g. «1008»), ahanup.com
 *   `/product_category/قیمت-میلگرد-کلاف-ساده-و-آجدار/» («آنالیز», e.g.
 *   «rst34», «A3») and modiranahan.com `/price/coil/ribbed` («استاندارد»,
 *   e.g. «A۲»). ahanonline's own `/میلگرد/قیمت-میلگرد/میلگرد-کلاف/` page
 *   folds it into a bare «نام کالا», which is why the 1405/06 data pass —
 *   looking only for a VALUE, and finding کلاف's varies per mill — recorded
 *   it as unpublished. The column is published; only the value is per-mill,
 *   which is what a per-row column is for. Wired to `skus.standard` (empty
 *   on all 6 live rows) rather than to `grade`, because two of the three
 *   sources' values are steel standards (A2/A3, RST34, 1008) and that is the
 *   field this catalog already stores standards in — see the `schedule`
 *   comment in `ATTR_DEFS` for why the two are never swapped.
 * - **`wire`, `wire-galvanized`, `tie`, `mesh` publish no spec column.**
 *   Checked, in order: ahanonline `/محصولات-مفتولی/سیم-مفتول/`,
 *   `/محصولات-مفتولی/سیم-آرماتور/`, `/محصولات-مفتولی/مش/` and
 *   `/محصولات-مفتولی/توری/توری-مرغی/` — every one is «نام کالا | تاریخ |
 *   قیمت | …» with the whole spec folded into the product name;
 *   esfahanahan.com `/steel/سیم-مفتولی-سیاه/` («عنوان | وزن کلاف | محل
 *   تحویل»); fouladtofighi.com `/solid-wire-price/` («نوع مفتول | وزن» for
 *   سیاه/آرماتوربندی, «نوع | ضخامت» for گالوانیزه); ahan1.com
 *   `/Category/net/welded-wire-mesh/` and emroozahan.com
 *   `/price/metal-mesh/weld-mesh-roll/` for توری. Not one publishes a
 *   labelled grade, analysis, standard or condition column. kilooton.com
 *   `/catalog/blackwire` does show an «RST34» chip on its مفتول سیاه cards,
 *   but its cards carry no headers at all, so it names no column and is not
 *   adopted. These four therefore publish no attribute column — a change
 *   from the empty «گرید» they show today, and the honest one.
 */
const WIRE_ATTRS: Readonly<Record<string, AttrKey[]>> = {
  'welding-wire': ['alloy'],
  'wire-rod': ['alloy', 'condition'],
  coil: ['standard'],
  'coil-ribbed': ['standard'],
  wire: [],
  'wire-galvanized': [],
  tie: [],
  mesh: [],
};

/**
 * Which attribute columns a table shows, given the page's category and the
 * currently-active sub-category filter (`null` = «همه», every sub-category
 * mixed into one table).
 *
 * Only تیرآهن, پروفیل, استیل, لوله, ورق and نبشی‌وناودانی ever deviate; every
 * other category always gets its one «گرید» column exactly as before. The
 * mixed «همه» view resolves to the category's default column set — the rule
 * تیرآهن has always used — and each cell then answers for its own row (see
 * `attributeColumns`).
 *
 * استیل used to deviate at the CATEGORY level («آلیاژ»+«طول شاخه» on every
 * sub, 1405/06 instruction). Superseded 1405/06/08: the owner confirmed
 * matching ahanonline.com's exact columns takes priority even where it
 * contradicts that earlier instruction, so استیل is now per-sub like پروفیل —
 * see `STEEL_ATTRS`. `['alloy', 'branchLength']` remains the fallback for its
 * currently-empty subs (فلنج، مش، رینگ، فنر، تسمه، تیوب، توری), which have no
 * live ahanonline page to verify against and no live rows to break; every
 * stored `grade` in this category is still an alloy designation
 * (۲۰۱/۳۰۴/۳۰۴L/۳۱۶L — verified across all 55 live SKUs, 1405/06), so «آلیاژ»
 * is the right word for the day they get stock. The mixed «همه» view stays on
 * this same default — exactly like پروفیل's مجموعه handling of صنعتی/Z —
 * so cells for `pipe`/`profile`/`angle`/`channel` rows read `NOT_APPLICABLE`
 * there rather than silently reusing a column that is not their own.
 */
export function attrKeysFor(
  categorySlug: string | null | undefined,
  sub: string | null,
): AttrKey[] {
  if (categorySlug === 'ibeam') {
    if (sub === null) return ['standard'];
    // هاش (hash-sabok/hash-sangin): ahanonline's own «تیرآهن-و-هاش/هاش» page
    // carries a «حالت» column beside «استاندارد» (sample row: "12 متری") —
    // re-verified live 1405/06/09.
    //
    // That length column is `branch`, not `branchLength`, corrected
    // 1405/06/09. Both keys read the same `branchLengthM`, but they differ in
    // BOTH halves a column is made of: `branchLength` prints the header «طول
    // شاخه» and the value «۱۲ متر», while the two sources checked print
    // «حالت» / «۱۲ متری» (ahanonline `/تیرآهن-و-هاش/هاش/`) and «حالت» /
    // «شاخه ۱۲ متری» (teleahan `/تیرآهن-هاش/هاش/`). #347 wired the right
    // FIELD under the wrong LABEL and the wrong number format; `branch` —
    // the key نبشی و ناودانی already uses for the identical «حالت»/«۶ متری»
    // pair — is both at once, so no new key is needed.
    if (IBEAM_STANDARD_SUBS.has(sub)) return ['standard', 'branch'];
    // لانه‌زنبوری publishes «استاندارد» (CPE) but no «حالت» — see
    // `IBEAM_CASTELLATED_SUBS`.
    if (IBEAM_CASTELLATED_SUBS.has(sub)) return ['standard'];
    // تیرآهن (plain IPE, `tirahan`) and تیرآهن سبک (`light`) publish NO
    // attribute column, and the bare `[]` they already had is correct —
    // re-verified 1405/06/09 across four sources, which agree that plain
    // تیرآهن is priced on سایز plus a weight and nothing else: ahanonline
    // `/تیرآهن-و-هاش/تیرآهن/` («سایز | محل تحویل | واحد | وزن | قیمت»),
    // teleahan `/تیرآهن-هاش/تیرآهن/` («نام محصول | سایز | محل تحویل | واحد |
    // وزن | قیمت»), markazeahan `/product-category/تیرآهن/` («سایز | وزن |
    // تعداد شاخه در هر بسته | محل بارگیری | واحد | قیمت») and esfahanahan
    // `/steel/تیرآهن/` («عنوان | سایز | محل تحویل | قیمت»). None publishes a
    // گرید, استاندارد or حالت column, and «وزن» is this catalog's own weight
    // column (`weightLabel`), not an attribute one. No source publishes a
    // «تیرآهن سبک» table of its own either, so `light` follows its parent.
    return [];
  }
  if (categorySlug === 'profile' && sub !== null) {
    return PROFILE_ATTRS[sub] ?? ['grade'];
  }
  // The mixed profile page contains rows whose source-specific replacement is
  // «حالت», «طول», «طول سفارشی» or «آلیاژ». There is no one honest attribute
  // header across that mixture; in particular, falling through to «گرید»
  // would restore the exact meaningless column removed from every priced
  // profile line above. Individual sub filters publish their verified fields.
  if (categorySlug === 'profile') return [];
  // ورق is category-wide: its owner-entered legacy `grade` values describe
  // supplied condition («برش‌خورده»/«رول»), not metallurgy. The dedicated
  // key reads the new `condition` column first and falls back only for this
  // verified legacy family until the guarded move has run; both an individual
  // sub and the mixed «همه» view therefore keep one unambiguous label.
  if (categorySlug === 'sheet') return ['legacyCondition'];
  if (categorySlug === 'felezat-rangi' && sub !== null) {
    return COLOURED_METAL_ATTRS[sub] ?? ['grade'];
  }
  // نبشی و ناودانی: four of its seven subs trade «گرید» — empty on every
  // live row of every one of them — for the «حالت» a buyer actually chooses
  // on (see ANGLE_CHANNEL_BRANCH_SUBS). نبشی لقمه, a fifth, trades it for the
  // «طول» of a piece cut to order (see ANGLE_CHANNEL_ORDER_LENGTH_SUBS).
  // سپری trades it for «طول شاخه»
  // instead — ahanonline's own page for سپری uses that label, not «حالت»
  // (see ANGLE_CHANNEL_BRANCH_LENGTH_SUBS). وال پست keeps its `grade` value
  // but relabelled «ضخامت», because that column genuinely holds a thickness
  // («ضخامت ۲») rather than a grade (see ANGLE_CHANNEL_THICKNESS_GRADE_SUBS).
  //
  // The mixed «همه» view deliberately stays on the category default
  // («گرید»), so it marks every one of these seven subs `NOT_APPLICABLE` —
  // exactly how پروفیل's mixed view already treats صنعتی and Z, whose grade
  // was likewise traded for a length.
  //
  // Re-verified per sub 1405/06/09 against ahanonline's own rendered price
  // tables and, where it has a page, markazeahan's: نبشی («سایز | ضخامت |
  // حالت»), ناودانی («سایز | حالت»), سپری («سایز | برند | طول شاخه») and
  // وال‌پست («بال | ضخامت | سایز») all still match what #343 wired, so none
  // of those four changed. Only نبشی لقمه moved — see
  // `ANGLE_CHANNEL_ORDER_LENGTH_SUBS`.
  if (categorySlug === 'angle-channel' && sub !== null) {
    if (ANGLE_CHANNEL_BRANCH_SUBS.has(sub)) return ['branch'];
    if (ANGLE_CHANNEL_BRANCH_LENGTH_SUBS.has(sub)) return ['branchLength'];
    if (ANGLE_CHANNEL_ORDER_LENGTH_SUBS.has(sub)) return ['customLength'];
    if (ANGLE_CHANNEL_THICKNESS_GRADE_SUBS.has(sub)) return ['gradeAsThickness'];
    return ['grade'];
  }
  if (categorySlug === 'pipe') {
    // Per-sub since 1405/06/09 — see `PIPE_ATTRS` for the source table. The
    // `['grade']` fallback is kept for the sub-categories with no live priced
    // row (and so no source table to reconcile against), exactly as پروفیل
    // and استیل keep theirs; every sub that HAS stock is listed explicitly.
    //
    // The mixed «همه» view now resolves to `[]` rather than to that
    // fallback. لوله's nine live subs no longer agree on any one attribute
    // column — «رده» belongs to مانیسمان alone, «حالت» to five others,
    // «استاندارد» to three — so any single header there would read
    // `NOT_APPLICABLE` for most of the page's own rows. That is the same
    // conclusion پروفیل's mixed view reached, and it also retires the empty
    // «گرید» that view used to print for every row in the category.
    return sub !== null ? (PIPE_ATTRS[sub] ?? ['grade']) : [];
  }
  if (categorySlug === 'wire') {
    // First reconciliation of this category — see `WIRE_ATTRS`. Same shape as
    // لوله above: a `['grade']` fallback for any future sub with no source
    // page yet, and `[]` for the mixed «همه» view, whose eight live subs
    // resolve to «آلیاژ», «استاندارد», «حالت» or nothing at all and share no
    // honest common header.
    return sub !== null ? (WIRE_ATTRS[sub] ?? ['grade']) : [];
  }
  if (categorySlug === 'steel') {
    return sub !== null
      ? (STEEL_ATTRS[sub] ?? ['alloy', 'branchLength'])
      : ['alloy', 'branchLength'];
  }
  return ['grade'];
}

export type AttrColumn = {
  key: AttrKey;
  label: string;
  /** Desktop table cell — always a string, so the column stays aligned. */
  cell: (row: AttrRow) => string;
  /** Mobile card line, or null when there is nothing worth a line: a card is a
   *  summary, not a spec sheet, and by the established convention of that card
   *  it omits a field rather than printing a placeholder. */
  card: (row: AttrRow) => string | null;
};

/**
 * The attribute columns for one table, each able to answer for any row in it.
 *
 * A cell reads `NOT_APPLICABLE` when the column is not a property of THAT row's
 * own sub-category — which only happens in a mixed «همه» view, where e.g. a
 * non-هاش تیرآهن row sits under «استاندارد», or a پروفیل صنعتی row (whose grade
 * was replaced by a length) sits under «گرید».
 */
export function attributeColumns(
  categorySlug: string | null | undefined,
  sub: string | null,
): AttrColumn[] {
  return attrKeysFor(categorySlug, sub).map((key) => {
    const def = ATTR_DEFS[key];
    const appliesTo = (row: AttrRow) => attrKeysFor(categorySlug, row.subCategoryId).includes(key);
    return {
      key,
      label: def.label,
      cell: (row) => (appliesTo(row) ? (def.read(row) ?? UNKNOWN_VALUE) : NOT_APPLICABLE),
      card: (row) => (appliesTo(row) ? (def.read(row) ?? null) : null),
    };
  });
}

/**
 * The Persian noun for one `PriceUnit` — what `qty` COUNTS in.
 *
 * This existed as four hand-copied `Record<PriceUnit, string>` literals: the
 * cart, the admin lead drawer, the admin lead-item route and the پیش‌فاکتور.
 * Adding «متر مربع» meant editing all four and hoping none was missed — the
 * same shape of problem that once labelled every coupler line «متر» on a
 * customer's proforma. One table now, and the `Record` makes the compiler
 * demand a key for every future member. (`track/TrackLookup` keeps its own
 * switch on purpose; it renders `kg` as «تن».)
 */
export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
  piece: 'عدد',
  sqm: 'متر مربع',
};

/**
 * The Persian noun for one unit of a price basis — «کیلوگرم», «شاخه», … —
 * without the «تومان /» prefix. One table, so the row caption, the page-wide
 * note, the spec sheet's «واحد فروش» row and the وزن‌سنج summary cannot drift
 * into three different words for the same thing.
 *
 * Deliberately NOT `PRICE_UNIT_LABEL` above, even though five of six entries
 * coincide: `meter` is a unit and never a basis, `coil` is a basis and never a
 * unit, and collapsing them would re-conflate the two facts the `price_basis`
 * column exists to separate.
 */
const PRICE_BASIS_NOUN: Record<PriceBasis, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  coil: 'کلاف',
  sheet: 'برگ',
  piece: 'عدد',
  sqm: 'متر مربع',
};

/**
 * «کلاف ۱۵ متری» — the basis noun, qualified by the branch/coil length when
 * the catalog records one. A length is only ever appended to a basis that IS
 * a length of something; «کیلوگرم ۶ متری» is nonsense and cannot be produced
 * here even if a stray `branchLengthM` is set on a kg-priced row.
 */
export function priceBasisNoun(
  basis: PriceBasis | null | undefined,
  branchLengthM?: number | null,
): string {
  const b: PriceBasis = basis ?? 'kg';
  const noun = PRICE_BASIS_NOUN[b] ?? PRICE_BASIS_NOUN.kg;
  if ((b === 'branch' || b === 'coil') && branchLengthM) {
    return `${noun} ${toPersianDigits(branchLengthM)} متری`;
  }
  return noun;
}

/**
 * What a price on a catalog row is denominated in — «تومان / کیلوگرم».
 *
 * This used to key off `unit` and hard-code the invariant that everything
 * except `piece` is per kilogram. That was false for 55 live rows: a لوله مسی
 * whose price is for a whole 15-metre coil rendered «۱۶٬۴۹۲٬۳۸۰ تومان /
 * کیلوگرم», which to a real buyer reads as a broken site. The denomination is
 * now a stored column (`PriceBasis`), so this just reads it.
 */
export function priceUnitCaption(
  basis: PriceBasis | null | undefined,
  branchLengthM?: number | null,
): string {
  return `تومان / ${priceBasisNoun(basis, branchLengthM)}`;
}

/**
 * The one price basis every given row shares, or null when they disagree.
 *
 * Backs the page-wide «قیمت‌ها … برای هر کیلوگرم است» note: a table mixing
 * kg-priced and عدد-priced products has to drop that sentence and let each
 * row caption itself rather than print a blanket claim that is wrong for some
 * of its own rows. Rows agreeing on the basis but not on the length are still
 * "one basis" — the note then omits the length rather than picking one.
 */
export function singlePriceBasis(
  rows: readonly { priceBasis?: PriceBasis | null; branchLengthM?: number | null }[],
): { basis: PriceBasis; branchLengthM?: number } | null {
  if (rows.length === 0) return { basis: 'kg' };
  const bases = new Set(rows.map((r) => r.priceBasis ?? 'kg'));
  if (bases.size !== 1) return null;
  const basis = [...bases][0] as PriceBasis;
  const lengths = new Set(rows.map((r) => r.branchLengthM ?? null));
  const only = lengths.size === 1 ? [...lengths][0] : null;
  return only ? { basis, branchLengthM: only } : { basis };
}

/* --------------------------- محل تولید (region) --------------------------- */

/**
 * The label a region section is announced by.
 *
 * Rows whose region could not be established fall into `UNKNOWN_VALUE`
 * («نامشخص»), not `NOT_APPLICABLE`: unlike the attribute columns above, a
 * پروفیل IS rolled somewhere — we simply do not know where, so the honest
 * word is "unspecified", never a dash meaning "does not apply".
 */
export const REGION_LABEL = 'محل تولید';

/** Whole-token lookup set for `regionFromFactory`. */
const CITY_NAMES = new Set(CITIES.map((c) => c.name));

/**
 * Best-effort city extraction from a stored mill name.
 *
 * **This is a reconstruction from data we already had, not sourced regional
 * data.** Nothing in this catalog records where a پروفیل is actually rolled.
 * What it does record, for the sub-categories whose `skus.factory` is
 * fabricated, are strings that nevertheless embed a real Iranian city —
 * «پایا اصفهان», «تهران شرق», «فولاد مشهد» — because whoever seeded them
 * reached for plausible-sounding Iranian mill names. That embedded city is
 * the only regional signal the data contains, and ahanonline (the reference
 * these pages are benchmarked against) structures its پروفیل pages by exactly
 * that: «پروفیل اصفهان», «پروفیل تهران». So we recover it rather than
 * inventing one, and nothing downstream should be read as a verified claim
 * about a mill's location.
 *
 * A name with no city in it («نیکان پروفیل», «کیان پرشیا») resolves to
 * `undefined` and lands in the «نامشخص» bucket — never guessed at.
 *
 * Matching is on WHOLE tokens against the road-freight city list this repo
 * already maintains (`data/logistics.CITIES`), not on substrings: «قم» and
 * «ساری» both occur inside plenty of Persian words that are not those cities,
 * and a substring match would silently invent a region for them.
 */
export function regionFromFactory(factory: string | null | undefined): string | undefined {
  if (!factory) return undefined;
  // ZWNJ (U+200C) joins written-together words in Persian and is a token
  // boundary here exactly like a space, so «تهران\u200cشرق» still yields تهران.
  for (const token of factory.split(/[\s\u200c\u200f]+/)) {
    if (token && CITY_NAMES.has(token)) return token;
  }
  return undefined;
}

/**
 * How one price table groups its rows into sections.
 *
 * `factory` is the long-standing «بر اساس کارخانه» structure and stays the
 * default for every category that has real mill names. `region` is its
 * replacement on the پروفیل subs whose mill names are withheld — the
 * structural half of "make it like ahanonline", which groups پروفیل by
 * producing city rather than by brand. `none` is one flat table.
 */
export type GroupMode = 'factory' | 'region' | 'none';

/**
 * Fraction of a table's rows that must resolve to a real city before grouping
 * by region beats one flat list.
 *
 * Below this the page would be one large «نامشخص» section plus a couple of
 * one-row cities — a structure that advertises a regional story the data
 * cannot actually tell. Half is the line: at 50% the named sections carry as
 * many rows as the unknown bucket does.
 */
const REGION_COVERAGE_MIN = 0.5;

/**
 * Which grouping a set of visible rows supports — decided from the rows
 * themselves, never from a category/sub allow-list.
 *
 * Both inputs are already resolved at the DTO boundary
 * (`catalogRepo.toPriceRow` withholds the fabricated factories and derives
 * `region` from them there), so this needs no second opinion about which
 * products have mills. It also means the page heals itself: the day «پروفیل
 * ساختمانی» — the one sub that KEEPS its factory — gets priced stock, the
 * mixed «همه» view has mill names in it again and the factory sections come
 * back on their own.
 */
export function groupModeFor(rows: readonly { factory?: string; region?: string }[]): GroupMode {
  if (rows.some((r) => r.factory)) return 'factory';
  const resolved = rows.filter((r) => r.region).length;
  if (resolved === 0) return 'none';
  return resolved / rows.length >= REGION_COVERAGE_MIN ? 'region' : 'none';
}

/** The catch-all section name in `factory` mode — rows with no mill at all. */
export const OTHER_GROUP = 'سایر';

/**
 * The section a row belongs to under `mode`. Under `none` every row shares
 * the single unnamed section, so the key is the empty string.
 */
export function groupKeyFor(mode: GroupMode, row: { factory?: string; region?: string }): string {
  if (mode === 'factory') return row.factory ?? OTHER_GROUP;
  if (mode === 'region') return row.region ?? UNKNOWN_VALUE;
  return '';
}

/**
 * What a sub-category page is *about*, spelled once — «میلگرد آجدار», not
 * «میلگرد آجدار میلگرد».
 *
 * A sub-category page titles itself «قیمت روز {sub} {category}» so that the
 * category keyword is in the title even when the sub name alone would be
 * ambiguous («هاش سبک» → «قیمت روز هاش سبک تیرآهن»). But 29 of the live
 * sub-categories already carry the category word inside their own name, and
 * appending it a second time produced titles, H1s and meta descriptions
 * reading «قیمت روز میلگرد آجدار میلگرد», «قیمت روز لوله استیل استیل» and —
 * worst of all — «قیمت روز تیرآهن تیرآهن», where the sub is named exactly
 * after its category. A repeated word in the one line Google shows is a
 * quality signal in the wrong direction, and it is also just wrong Persian.
 *
 * The rule: append the category name only when the sub name does not already
 * contain it, comparing on a normalised form so a ZWNJ or an Arabic ي/ك — both
 * of which occur in admin-entered names — cannot make «لوله» fail to match
 * «لوله». Matching is on whole space-separated tokens, so a category name is
 * never found inside a longer word.
 *
 * Deliberately NOT handled: «نبشی و ناودانی», whose subs («نبشی», «ناودانی
 * سبک») each repeat one word of a two-word category without containing the
 * whole of it. Trimming per-token there produces «ناودانی سبک نبشی و»; that
 * category wants a shorter display name, which is an owner decision, not a
 * string rule.
 */
export function subCategorySubject(subName: string, categoryName: string): string {
  return subNameCoversCategory(subName, categoryName) ? subName : `${subName} ${categoryName}`;
}

/**
 * What one factory-grouped price section is a section OF — the subject in
 * «قیمت {موضوع} {کارخانه}».
 *
 * Normally the category name, which is what every category has always used
 * and what «قیمت میلگرد کویر کاشان» still gets. On the تیرآهن sub-types
 * listed in IBEAM_SUBTYPE_HEADING_SUBS it becomes «{category} {sub}» —
 * «تیرآهن هاش سبک» — so the heading finally agrees with the product names
 * underneath it.
 *
 * Deliberately NOT `subCategorySubject`, even though the two answer
 * neighbouring questions. That one builds a PAGE TITLE, «{sub} {category}»
 * («قیمت روز هاش سبک تیرآهن»), where the SEO job is to get the category
 * keyword into the line at all. This is a section heading that already
 * carries a mill name after it, and the same word order there strands the
 * product word three phrases away from its mill: «قیمت هاش سبک تیرآهن
 * ذوب‌آهن اصفهان» reads as a تیرآهن made by a mill called «ذوب‌آهن اصفهان»
 * only if you parse it carefully. Category-first keeps the qualifier next to
 * what it qualifies and matches the phrasing the owner asked for.
 *
 * It DOES reuse that function's `subNameCoversCategory` de-duplication, so a
 * sub later renamed «تیرآهن هاش سبک» yields «تیرآهن هاش سبک», never
 * «تیرآهن تیرآهن هاش سبک» — the two helpers cannot drift on that rule.
 *
 * `activeSub` is null in the mixed «همه» view, and that is the whole reason
 * this takes the ACTIVE filter rather than the page's own sub: one mill's
 * section there can hold plain تیرآهن and هاش rows at once, so no
 * sub-specific subject is true of all of them and the generic category name
 * is the only honest answer — the same "mixed context → generic fallback"
 * rule `dimensionsLabel` and `factoryLabel` already follow.
 */
export function sectionSubject(
  categoryName: string,
  categorySlug: string | null | undefined,
  activeSub: { slug: string; name: string } | null | undefined,
): string {
  if (!activeSub) return categoryName;
  if (categorySlug !== 'ibeam' || !IBEAM_SUBTYPE_HEADING_SUBS.has(activeSub.slug)) {
    return categoryName;
  }
  return subNameCoversCategory(activeSub.name, categoryName)
    ? activeSub.name
    : `${categoryName} ${activeSub.name}`;
}

/** Does `subName` already say `categoryName`, as a run of whole tokens? */
function subNameCoversCategory(subName: string, categoryName: string): boolean {
  const sub = normalizeForMatch(subName);
  const cat = normalizeForMatch(categoryName);
  if (!cat) return false;
  return ` ${sub} `.includes(` ${cat} `);
}

/**
 * Persian text as it should be compared, not as it is stored: ZWNJ removed
 * («لوله‌گوشت‌دار» and «لوله گوشت دار» are the same words), the Arabic ي and ك
 * folded onto the Persian ی and ک, and runs of whitespace collapsed.
 */
function normalizeForMatch(s: string): string {
  return s.replace(/‌/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().replace(/\s+/g, ' ');
}
